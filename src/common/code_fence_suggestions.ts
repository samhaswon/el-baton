/* TYPES */

type CodeFenceContext = {
  marker: string;
  query: string;
  queryStart: number;
};

/* CONSTANTS */

const BASE_CODE_FENCE_LANGUAGES = [
  'bash',
  'sh',
  'zsh',
  'fish',
  'powershell',
  'ps1',
  'cmd',
  'batch',
  'javascript',
  'js',
  'typescript',
  'ts',
  'jsx',
  'tsx',
  'json',
  'yaml',
  'yml',
  'toml',
  'ini',
  'html',
  'xml',
  'css',
  'scss',
  'less',
  'markdown',
  'md',
  'python',
  'py',
  'java',
  'kotlin',
  'go',
  'rust',
  'c',
  'cpp',
  'csharp',
  'sql',
  'php',
  'ruby',
  'perl',
  'swift',
  'dart',
  'lua',
  'r',
  'dockerfile',
  'makefile',
  'mermaid',
  'plantuml',
  'puml',
  'uml',
  'katex',
  'latex',
  'tex',
  'asciimath'
];

/* CODE FENCE SUGGESTIONS */

const CodeFenceSuggestions = {

  baseLanguages: BASE_CODE_FENCE_LANGUAGES,

  getContext ( beforeCursor: string ): CodeFenceContext | null {

    if ( !beforeCursor ) return null;

    const match = beforeCursor.match ( /^(\s{0,3}(?:`{3,}|~{3,}))([a-z0-9_+#.-]*)$/i );

    if ( !match ) return null;

    const marker = match[1] || '',
          query = ( match[2] || '' ).toLowerCase (),
          queryStart = marker.length;

    return { marker, query, queryStart };

  },

  getSuggestions ( query: string = '', candidates: string[] = [], limit: number = 30 ): string[] {

    const normalizedQuery = String ( query || '' ).trim ().toLowerCase ();
    const uniqueCandidates: string[] = [];
    const seen = new Set<string> ();

    for ( let index = 0, length = candidates.length; index < length; index++ ) {
      const candidate = String ( candidates[index] || '' ).trim ();

      if ( !candidate ) continue;

      const normalizedCandidate = candidate.toLowerCase ();

      if ( seen.has ( normalizedCandidate ) ) continue;

      seen.add ( normalizedCandidate );
      uniqueCandidates.push ( candidate );
    }

    const startsWithMatches: string[] = [];
    const containsMatches: string[] = [];

    for ( let index = 0, length = uniqueCandidates.length; index < length; index++ ) {
      const candidate = uniqueCandidates[index],
            normalizedCandidate = candidate.toLowerCase ();

      if ( normalizedQuery && !normalizedCandidate.includes ( normalizedQuery ) ) continue;

      if ( !normalizedQuery || normalizedCandidate.startsWith ( normalizedQuery ) ) {
        startsWithMatches.push ( candidate );
      } else {
        containsMatches.push ( candidate );
      }
    }

    return [...startsWithMatches, ...containsMatches].slice ( 0, limit );

  },

  isOpeningContext ( context: CodeFenceContext, linesBefore: string[] = [] ): boolean {

    if ( !context ) return false;

    if ( context.query ) return true;

    const marker = context.marker.trimStart (),
          markerMatch = marker.match ( /^([`~]{3,})$/ );

    if ( !markerMatch ) return true;

    const markerText = markerMatch[1],
          markerChar = markerText[0],
          markerLength = markerText.length;

    let openFence: { char: string, length: number } | null = null;

    for ( let index = 0, length = linesBefore.length; index < length; index++ ) {
      const line = linesBefore[index],
            fenceMatch = line.match ( /^\s{0,3}([`~]{3,})(.*)$/ );

      if ( !fenceMatch ) continue;

      const fenceText = fenceMatch[1] || '',
            fenceChar = fenceText[0],
            fenceLength = fenceText.length,
            fenceSuffix = fenceMatch[2] || '',
            isClosingFence = !fenceSuffix.trim ();

      if ( !openFence ) {
        openFence = { char: fenceChar, length: fenceLength };
        continue;
      }

      if ( fenceChar === openFence.char && fenceLength >= openFence.length && isClosingFence ) {
        openFence = null;
      }
    }

    if ( !openFence ) return true;
    if ( openFence.char !== markerChar ) return true;

    return markerLength < openFence.length;

  }

};

/* EXPORT */

export default CodeFenceSuggestions;
