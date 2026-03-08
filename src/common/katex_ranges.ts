/* TYPES */

type Range = { start: number, end: number };

/* HELPERS */

const isEscapedAt = ( value: string, index: number ): boolean => {

  let slashCount = 0;

  for ( let i = index - 1; i >= 0 && value[i] === '\\'; i-- ) {
    slashCount++;
  }

  return ( slashCount % 2 ) === 1;

};

const normalizeFenceLanguage = ( info: string ): string => {

  const firstToken = ( info || '' ).trim ().split ( /\s+/, 1 )[0] || '';

  return firstToken
    .toLowerCase ()
    .replace ( /^\{/, '' )
    .replace ( /\}$/, '' )
    .replace ( /^\./, '' );

};

const mergeRanges = ( ranges: Range[] ): Range[] => {

  if ( !ranges.length ) return [];

  const sorted = ranges
    .filter ( range => range.end > range.start )
    .sort ( ( a, b ) => a.start - b.start || a.end - b.end );

  if ( !sorted.length ) return [];

  const merged: Range[] = [sorted[0]];

  for ( let index = 1, l = sorted.length; index < l; index++ ) {
    const current = sorted[index],
          previous = merged[merged.length - 1];

    if ( current.start <= previous.end ) {
      previous.end = Math.max ( previous.end, current.end );
      continue;
    }

    merged.push ({ ...current });
  }

  return merged;

};

const findFencedCodeBlocks = ( value: string ): { allFenceRanges: Range[], katexFenceRanges: Range[] } => {

  const lines = value.split ( '\n' );
  const lineStarts = new Array<number> ( lines.length );

  let offset = 0;

  for ( let index = 0, l = lines.length; index < l; index++ ) {
    lineStarts[index] = offset;
    offset += lines[index].length + 1;
  }

  const allFenceRanges: Range[] = [];
  const katexFenceRanges: Range[] = [];

  for ( let index = 0, l = lines.length; index < l; index++ ) {
    const line = lines[index].replace ( /\r$/, '' ),
          open = line.match ( /^([ \t]*)(`{3,}|~{3,})(.*)$/ );

    if ( !open ) continue;

    const fenceSequence = open[2],
          fenceChar = fenceSequence[0],
          fenceLength = fenceSequence.length,
          language = normalizeFenceLanguage ( open[3] || '' ),
          isKatexFence = /^(tex|latex|katex)$/.test ( language ),
          closePattern = new RegExp ( `^[ \\t]*\\${fenceChar}{${fenceLength},}[ \\t]*$` );

    let closeIndex = -1;

    for ( let nextIndex = index + 1; nextIndex < l; nextIndex++ ) {
      if ( closePattern.test ( lines[nextIndex].replace ( /\r$/, '' ) ) ) {
        closeIndex = nextIndex;
        break;
      }
    }

    if ( closeIndex === -1 ) continue;

    const start = lineStarts[index],
          end = lineStarts[closeIndex] + lines[closeIndex].length;

    allFenceRanges.push ({ start, end });
    if ( isKatexFence ) katexFenceRanges.push ({ start, end });

    index = closeIndex;
  }

  return {
    allFenceRanges: mergeRanges ( allFenceRanges ),
    katexFenceRanges: mergeRanges ( katexFenceRanges )
  };

};

const isInRanges = ( ranges: Range[], index: number, startAt: number ): { inRange: boolean, nextIndex: number } => {

  let rangeIndex = startAt;

  while ( rangeIndex < ranges.length && ranges[rangeIndex].end <= index ) {
    rangeIndex++;
  }

  if ( rangeIndex < ranges.length ) {
    const range = ranges[rangeIndex];
    if ( index >= range.start && index < range.end ) {
      return { inRange: true, nextIndex: rangeIndex };
    }
  }

  return { inRange: false, nextIndex: rangeIndex };

};

const findInlineCodeRanges = ( value: string, excludedRanges: Range[] ): Range[] => {

  const ranges: Range[] = [];

  let excludedIndex = 0;

  for ( let index = 0; index < value.length; ) {
    const exclusion = isInRanges ( excludedRanges, index, excludedIndex );
    excludedIndex = exclusion.nextIndex;

    if ( exclusion.inRange ) {
      index = excludedRanges[excludedIndex].end;
      continue;
    }

    if ( value[index] !== '`' || isEscapedAt ( value, index ) ) {
      index++;
      continue;
    }

    let delimiterLength = 1;

    while ( value[index + delimiterLength] === '`' ) {
      delimiterLength++;
    }

    let closeStart = -1;

    for ( let scanIndex = index + delimiterLength; scanIndex < value.length; scanIndex++ ) {
      const innerExclusion = isInRanges ( excludedRanges, scanIndex, excludedIndex );
      excludedIndex = innerExclusion.nextIndex;

      if ( innerExclusion.inRange ) {
        scanIndex = excludedRanges[excludedIndex].end - 1;
        continue;
      }

      if ( value[scanIndex] === '\n' || value[scanIndex] === '\r' ) break;
      if ( value[scanIndex] !== '`' || isEscapedAt ( value, scanIndex ) ) continue;

      let closeLength = 1;
      while ( value[scanIndex + closeLength] === '`' ) closeLength++;

      if ( closeLength !== delimiterLength ) continue;
      if ( scanIndex <= index + delimiterLength ) continue;

      closeStart = scanIndex;
      break;
    }

    if ( closeStart === -1 ) {
      index += delimiterLength;
      continue;
    }

    ranges.push ({
      start: index,
      end: closeStart + delimiterLength
    });

    index = closeStart + delimiterLength;
  }

  return mergeRanges ( ranges );

};

const findMathRanges = ( value: string, excludedRanges: Range[] ): Range[] => {

  const ranges: Range[] = [];
  let excludedIndex = 0;

  for ( let index = 0; index < value.length; ) {
    const exclusion = isInRanges ( excludedRanges, index, excludedIndex );
    excludedIndex = exclusion.nextIndex;

    if ( exclusion.inRange ) {
      index = excludedRanges[excludedIndex].end;
      continue;
    }

    if ( value[index] !== '$' || isEscapedAt ( value, index ) ) {
      index += 1;
      continue;
    }

    const displayMode = value[index + 1] === '$',
          delimiterLength = displayMode ? 2 : 1,
          openEnd = index + delimiterLength;

    let closeStart = -1;

    for ( let scanIndex = openEnd; scanIndex < value.length; scanIndex++ ) {
      const innerExclusion = isInRanges ( excludedRanges, scanIndex, excludedIndex );
      excludedIndex = innerExclusion.nextIndex;

      if ( innerExclusion.inRange ) {
        scanIndex = excludedRanges[excludedIndex].end - 1;
        continue;
      }

      if ( !displayMode && value[scanIndex] === '\n' ) break;
      if ( value[scanIndex] !== '$' || isEscapedAt ( value, scanIndex ) ) continue;

      if ( displayMode ) {
        if ( value[scanIndex + 1] !== '$' ) continue;
        closeStart = scanIndex;
        break;
      }

      if ( value[scanIndex - 1] === '$' || value[scanIndex + 1] === '$' ) continue;
      closeStart = scanIndex;
      break;
    }

    if ( closeStart === -1 ) {
      index += 1;
      continue;
    }

    ranges.push ({
      start: index,
      end: closeStart + delimiterLength
    });

    index = closeStart + delimiterLength;
  }

  return mergeRanges ( ranges );

};

/* API */

const KatexRanges = {

  find ( value: string ): Range[] {

    if ( !value ) return [];

    const { allFenceRanges, katexFenceRanges } = findFencedCodeBlocks ( value ),
          inlineCodeRanges = findInlineCodeRanges ( value, allFenceRanges ),
          nonMathRanges = mergeRanges ([...allFenceRanges, ...inlineCodeRanges]),
          mathRanges = findMathRanges ( value, nonMathRanges );

    return mergeRanges ([...katexFenceRanges, ...mathRanges]);

  }

};

/* EXPORT */

export default KatexRanges;

