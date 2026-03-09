
/* IMPORT */

import * as _ from 'lodash';
import {decode} from 'html-entities';

let Prism: any,
    prismLanguages: Record<string, { require?: string | string[] }> = {};

const initPrism = _.once ( () => {
  const workerGlobalScope = ( globalThis as any ).WorkerGlobalScope,
        isWorker = typeof workerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof workerGlobalScope;

  if ( isWorker ) {
    const globalScope = self as any;
    globalScope.Prism = {
      ...( globalScope.Prism || {} ),
      disableWorkerMessageHandler: true
    };
  }

  Prism = require ( 'prismjs' );
  prismLanguages = require ( 'prismjs/components.js' ).languages || {};
});

/* HIGHLIGHTER */

const Highlighter = {

  languageRe: /language-([^\s"']*)/i,

  languagesAliases: { // language => language to use instead
    csharp: 'csharp',
    'c#': 'csharp',
    'c++': 'cpp',
    js: 'javascript',
    jsx: 'jsx',
    katex: 'latex',
    latex: 'latex',
    md: 'markdown',
    py: 'python',
    python3: 'python',
    ps: 'powershell',
    ps1: 'powershell',
    rb: 'ruby',
    sh: 'bash',
    shell: 'bash',
    tex: 'latex',
    ts: 'typescript',
    yml: 'yaml',
    zsh: 'bash'
  },

  sanitizeLanguage ( language: string ): string {

    return ( language || '' ).trim ().toLowerCase ();

  },

  inferLanguage ( str: string ): string | undefined {

    if ( !str ) return;

    let match = str.match ( Highlighter.languageRe );

    if ( match ) return Highlighter.sanitizeLanguage ( match[1] );

    // Fallback for markup not using `language-*` classes.
    match = str.match ( /\blang(?:uage)?=["']?([^\s"'/>]+)/i );

    if ( match ) return Highlighter.sanitizeLanguage ( match[1] );

  },

  initLanguage ( language: string ): boolean { // Loading needed languages dynamically, for performance and because WebPack complains about the included `loadLanguages` function //TODO: Add support for peerDependencies

    initPrism ();

    if ( Prism.languages[language] ) return true;

    const lang = prismLanguages[language];

    if ( !lang ) return false;

    if ( lang.require && !_.castArray ( lang.require ).every ( Highlighter.initLanguage ) ) return false;

    require ( `prismjs/components/prism-${language}.min.js` );

    return true;

  },

  highlight ( str: string, language?: string ): string {

    if ( !language ) return str;

    initPrism ();

    const normalized = Highlighter.sanitizeLanguage ( language ),
          lang = Highlighter.languagesAliases[normalized] || normalized;

    if ( !Highlighter.initLanguage ( lang ) ) return str;

    return Prism.highlight ( decode ( str ), Prism.languages[lang], lang );

  }

};

/* EXPORT */

export default Highlighter;
