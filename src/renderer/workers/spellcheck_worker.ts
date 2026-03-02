/* IMPORT */

let spellchecker: { isMisspelled: ( word: string ) => boolean, getCorrectionsForMisspelling: ( word: string ) => string[] } | undefined;

try {
  spellchecker = require ( 'spellchecker' );
} catch {
  // Keep worker alive even when native module ABI/header rebuild is missing.
  // The worker reports "unavailable" back to the UI, so avoid noisy startup logs here.
}

/* TYPES */

type SpellcheckMessage = {
  type: 'spellcheck';
  id: number;
  content: string;
};

type AddWordMessage = {
  type: 'add-word';
  id: number;
  word: string;
};

type CancelMessage = {
  type: 'cancel';
  id: number;
};

type WorkerMessage = SpellcheckMessage | AddWordMessage | CancelMessage;

declare const self: {
  onmessage: ( event: MessageEvent<WorkerMessage> ) => void | Promise<void>;
  postMessage: ( message: any ) => void;
};

/* CONSTANTS */

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;
const MAX_SUGGESTIONS = 3;

/* STATE */

const cancelled = new Set<number> ();
const sessionDictionary = new Set<string> ();

/* HELPERS */

const shouldCheckWord = ( word: string ): boolean => {

  if ( word.length <= 2 ) return false;
  if ( /^\d+$/.test ( word ) ) return false;
  if ( /^[A-Z]{2,}$/.test ( word ) ) return false;

  return true;

};

const normalizeWord = ( word: string ): string => {

  return ( word || '' ).trim ().toLowerCase ();

};

const isEscapedAt = ( content: string, index: number ): boolean => {

  let slashCount = 0;

  for ( let i = index - 1; i >= 0 && content[i] === '\\'; i-- ) {
    slashCount++;
  }

  return ( slashCount % 2 ) === 1;

};

const findMathRanges = ( content: string ): { start: number, end: number }[] => {

  const ranges: { start: number, end: number }[] = [];

  for ( let i = 0; i < content.length; ) {
    if ( content[i] !== '$' || isEscapedAt ( content, i ) ) {
      i += 1;
      continue;
    }

    const displayMode = content[i + 1] === '$';
    const delimiterLength = displayMode ? 2 : 1;
    const openEnd = i + delimiterLength;

    let closeStart = -1;

    for ( let j = openEnd; j < content.length; j++ ) {
      if ( !displayMode && content[j] === '\n' ) break;
      if ( content[j] !== '$' || isEscapedAt ( content, j ) ) continue;

      if ( displayMode ) {
        if ( content[j + 1] !== '$' ) continue;
        closeStart = j;
        break;
      }

      if ( content[j - 1] === '$' || content[j + 1] === '$' ) continue;
      closeStart = j;
      break;
    }

    if ( closeStart === -1 ) {
      i += 1;
      continue;
    }

    ranges.push ({
      start: i,
      end: closeStart + delimiterLength
    });

    i = closeStart + delimiterLength;
  }

  return ranges;

};

/* WORKER */

self.onmessage = ( event: MessageEvent<WorkerMessage> ) => {

  const message = event.data;

  if ( !message ) return;

  if ( message.type === 'cancel' ) {
    cancelled.add ( message.id );
    return;
  }

  if ( message.type === 'add-word' ) {
    const normalized = normalizeWord ( message.word );

    if ( normalized ) sessionDictionary.add ( normalized );

    self.postMessage ({ type: 'added', id: message.id, word: normalized });
    return;
  }

  const {id, content} = message;

  cancelled.delete ( id );

  try {
    if ( !spellchecker ) {
      self.postMessage ({ type: 'unavailable', id, error: 'Spellchecker native module unavailable' });
      return;
    }

    const misspellings: { start: number, end: number, word: string, suggestions: string[] }[] = [];
    const mathRanges = findMathRanges ( content );
    let match: RegExpExecArray | null;
    let rangeIndex = 0;

    WORD_RE.lastIndex = 0;

    while ( ( match = WORD_RE.exec ( content ) ) ) {
      if ( cancelled.has ( id ) ) {
        self.postMessage ({ type: 'cancelled', id });
        return;
      }

      const word = match[0];
      const wordStart = match.index;

      while ( rangeIndex < mathRanges.length && mathRanges[rangeIndex].end <= wordStart ) {
        rangeIndex++;
      }

      if ( rangeIndex < mathRanges.length ) {
        const range = mathRanges[rangeIndex];
        if ( wordStart >= range.start && wordStart < range.end ) continue;
      }

      if ( !shouldCheckWord ( word ) ) continue;
      if ( sessionDictionary.has ( normalizeWord ( word ) ) ) continue;
      if ( !spellchecker.isMisspelled ( word ) ) continue;

      misspellings.push ({
        start: match.index,
        end: match.index + word.length,
        word,
        suggestions: spellchecker.getCorrectionsForMisspelling ( word ).slice ( 0, MAX_SUGGESTIONS )
      });
    }

    self.postMessage ({ type: 'result', id, misspellings });
  } catch ( error ) {
    self.postMessage ({ type: 'error', id, error: error instanceof Error ? error.message : String ( error ) });
  } finally {
    cancelled.delete ( id );
  }

};

export {};
