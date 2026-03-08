/* IMPORT */

import KatexRanges from '@common/katex_ranges';

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

type SetWordsMessage = {
  type: 'set-words';
  id: number;
  words: string[];
};

type CancelMessage = {
  type: 'cancel';
  id: number;
};

type WorkerMessage = SpellcheckMessage | AddWordMessage | SetWordsMessage | CancelMessage;

declare const self: {
  onmessage: ( event: MessageEvent<WorkerMessage> ) => void | Promise<void>;
  postMessage: ( message: any ) => void;
};

/* CONSTANTS */

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

/* STATE */

const cancelled = new Set<number> ();
const sessionDictionary = new Set<string> ();
const persistentDictionary = new Set<string> ();

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

  if ( message.type === 'set-words' ) {
    persistentDictionary.clear ();

    for ( let index = 0, l = ( message.words || [] ).length; index < l; index++ ) {
      const normalized = normalizeWord ( message.words[index] );

      if ( normalized ) persistentDictionary.add ( normalized );
    }

    self.postMessage ({ type: 'set', id: message.id });
    return;
  }

  const {id, content} = message;

  cancelled.delete ( id );

  try {
    if ( !spellchecker ) {
      self.postMessage ({ type: 'unavailable', id, error: 'Spellchecker native module unavailable' });
      return;
    }

    const misspellings: { start: number, end: number, word: string }[] = [];
    const katexRanges = KatexRanges.find ( content );
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

      while ( rangeIndex < katexRanges.length && katexRanges[rangeIndex].end <= wordStart ) {
        rangeIndex++;
      }

      if ( rangeIndex < katexRanges.length ) {
        const range = katexRanges[rangeIndex];
        if ( wordStart >= range.start && wordStart < range.end ) continue;
      }

      if ( !shouldCheckWord ( word ) ) continue;
      if ( sessionDictionary.has ( normalizeWord ( word ) ) ) continue;
      if ( persistentDictionary.has ( normalizeWord ( word ) ) ) continue;
      if ( !spellchecker.isMisspelled ( word ) ) continue;

      misspellings.push ({
        start: match.index,
        end: match.index + word.length,
        word
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
