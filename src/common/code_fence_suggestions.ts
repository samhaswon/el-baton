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

  }

};

/* EXPORT */

export default CodeFenceSuggestions;
