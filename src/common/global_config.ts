/* IMPORT */

import * as fs from 'fs';
import * as path from 'path';
import {dump as dumpYAML, load as loadYAML} from 'js-yaml';

/* TYPES */

type MonacoLineNumbersMode = 'off' | 'on' | 'relative';

type GlobalConfigShape = {
  autoupdate: boolean,
  spellcheck: {
    addedWords: string[]
  },
  ui: {
    disableAnimations: boolean
  },
  input: {
    disableMiddleClickPaste: boolean
  },
  preview: {
    largeNoteFullRenderDelay: number
    disableScriptSanitization: boolean
  },
  monaco: {
    tableFormattingDelay: number,
    editorOptions: {
      lineNumbers: MonacoLineNumbersMode,
      disableSuggestions: boolean,
      tabSize: number
    }
  },
  plantuml: {
    externalServerUrl: string,
    requestTimeoutMs: number,
    cacheMaxEntries: number,
    cacheMaxBytes: number
  }
};

/* GLOBAL CONFIG */

const DEFAULTS: GlobalConfigShape = {
  autoupdate: true,
  spellcheck: {
    addedWords: []
  },
  ui: {
    disableAnimations: false
  },
  input: {
    disableMiddleClickPaste: false
  },
  preview: {
    largeNoteFullRenderDelay: 500,
    disableScriptSanitization: false
  },
  monaco: {
    tableFormattingDelay: 2000,
    editorOptions: {
      lineNumbers: 'on',
      disableSuggestions: false,
      tabSize: 2
    }
  },
  plantuml: {
    externalServerUrl: '',
    requestTimeoutMs: 12000,
    cacheMaxEntries: 400,
    cacheMaxBytes: 64 * 1024 * 1024
  }
};

const FILE_NAMES = [
  '.el-baton.yml',
  '.el-baton.yaml',
  '.el-baton.json',
  '.notable.yml',
  '.notable.yaml',
  '.notable.json',
  'config.yml',
  'config.yaml',
  'config.json'
];

const GlobalConfig = {

  defaults: DEFAULTS,
  fileNames: FILE_NAMES,

  normalizeSpellcheckWord ( word: unknown ): string | undefined {

    if ( !word ) return;

    const normalized = String ( word ).trim ().toLowerCase ();

    if ( !normalized ) return;
    if ( !/^[a-z][a-z'’-]*$/.test ( normalized ) ) return;

    return normalized;

  },

  normalizeSpellcheckWords ( words: unknown ): string[] {

    if ( !Array.isArray ( words ) ) return [];

    const normalized = words.reduce ( ( acc, word ) => {
      const normalizedWord = GlobalConfig.normalizeSpellcheckWord ( word );

      if ( !normalizedWord || acc.includes ( normalizedWord ) ) return acc;

      acc.push ( normalizedWord );

      return acc;
    }, [] as string[] );

    normalized.sort (( a, b ) => a.localeCompare ( b ) );

    return normalized;

  },

  isRecord ( value: unknown ): value is Record<string, unknown> {

    return !!value && typeof value === 'object' && !Array.isArray ( value );

  },

  cloneDefaults (): GlobalConfigShape {

    return {
      autoupdate: DEFAULTS.autoupdate,
      spellcheck: {
        addedWords: [...DEFAULTS.spellcheck.addedWords]
      },
      ui: {
        disableAnimations: DEFAULTS.ui.disableAnimations
      },
      input: {
        disableMiddleClickPaste: DEFAULTS.input.disableMiddleClickPaste
      },
      preview: {
        largeNoteFullRenderDelay: DEFAULTS.preview.largeNoteFullRenderDelay,
        disableScriptSanitization: DEFAULTS.preview.disableScriptSanitization
      },
      monaco: {
        tableFormattingDelay: DEFAULTS.monaco.tableFormattingDelay,
        editorOptions: {
          lineNumbers: DEFAULTS.monaco.editorOptions.lineNumbers,
          disableSuggestions: DEFAULTS.monaco.editorOptions.disableSuggestions,
          tabSize: DEFAULTS.monaco.editorOptions.tabSize
        }
      },
      plantuml: {
        externalServerUrl: DEFAULTS.plantuml.externalServerUrl,
        requestTimeoutMs: DEFAULTS.plantuml.requestTimeoutMs,
        cacheMaxEntries: DEFAULTS.plantuml.cacheMaxEntries,
        cacheMaxBytes: DEFAULTS.plantuml.cacheMaxBytes
      }
    };

  },

  resolvePath ( cwd?: string ): string | undefined {

    if ( !cwd ) return;

    for ( let index = 0, l = FILE_NAMES.length; index < l; index++ ) {

      const filePath = path.join ( cwd, FILE_NAMES[index] );

      try {
        if ( fs.statSync ( filePath ).isFile () ) return filePath;
      } catch ( error ) {
        continue;
      }

    }

  },

  parse ( content: string, filePath: string ): Record<string, unknown> | undefined {

    const ext = path.extname ( filePath ).toLowerCase ();

    const parsed = ext === '.json' ? JSON.parse ( content ) : loadYAML ( content );

    return GlobalConfig.isRecord ( parsed ) ? parsed : undefined;

  },

  normalize ( config?: Record<string, unknown> ): GlobalConfigShape {

    const normalized = GlobalConfig.cloneDefaults ();

    if ( !GlobalConfig.isRecord ( config ) ) return normalized;

    if ( 'autoupdate' in config ) {
      normalized.autoupdate = !!config.autoupdate;
    }

    if ( GlobalConfig.isRecord ( config.spellcheck ) && 'addedWords' in config.spellcheck ) {
      normalized.spellcheck.addedWords = GlobalConfig.normalizeSpellcheckWords ( config.spellcheck.addedWords );
    }

    if ( GlobalConfig.isRecord ( config.ui ) && 'disableAnimations' in config.ui ) {
      normalized.ui.disableAnimations = !!config.ui.disableAnimations;
    }

    if ( GlobalConfig.isRecord ( config.input ) && 'disableMiddleClickPaste' in config.input ) {
      normalized.input.disableMiddleClickPaste = !!config.input.disableMiddleClickPaste;
    }

    if ( GlobalConfig.isRecord ( config.preview ) && 'largeNoteFullRenderDelay' in config.preview ) {
      const delay = Number ( config.preview.largeNoteFullRenderDelay );

      if ( Number.isFinite ( delay ) ) {
        normalized.preview.largeNoteFullRenderDelay = Math.max ( 0, Math.min ( 5000, Math.round ( delay ) ) );
      }
    }

    if ( GlobalConfig.isRecord ( config.preview ) && 'disableScriptSanitization' in config.preview ) {
      normalized.preview.disableScriptSanitization = !!config.preview.disableScriptSanitization;
    }

    if ( GlobalConfig.isRecord ( config.monaco ) && 'tableFormattingDelay' in config.monaco ) {
      const delay = Number ( config.monaco.tableFormattingDelay );

      if ( Number.isFinite ( delay ) ) {
        normalized.monaco.tableFormattingDelay = Math.max ( 0, Math.min ( 5000, Math.round ( delay ) ) );
      }
    }

    if ( GlobalConfig.isRecord ( config.monaco ) && GlobalConfig.isRecord ( config.monaco.editorOptions ) && 'lineNumbers' in config.monaco.editorOptions ) {
      const lineNumbers = String ( config.monaco.editorOptions.lineNumbers ).toLowerCase ();

      if ( lineNumbers === 'off' || lineNumbers === 'relative' || lineNumbers === 'on' ) {
        normalized.monaco.editorOptions.lineNumbers = lineNumbers;
      }
    }

    if ( GlobalConfig.isRecord ( config.monaco ) && GlobalConfig.isRecord ( config.monaco.editorOptions ) && 'disableSuggestions' in config.monaco.editorOptions ) {
      normalized.monaco.editorOptions.disableSuggestions = !!config.monaco.editorOptions.disableSuggestions;
    }

    if ( GlobalConfig.isRecord ( config.monaco ) && GlobalConfig.isRecord ( config.monaco.editorOptions ) && 'tabSize' in config.monaco.editorOptions ) {
      const tabSize = Number ( config.monaco.editorOptions.tabSize );

      if ( Number.isFinite ( tabSize ) ) {
        normalized.monaco.editorOptions.tabSize = Math.max ( 1, Math.min ( 8, Math.round ( tabSize ) ) );
      }
    }

    if ( GlobalConfig.isRecord ( config.plantuml ) && 'externalServerUrl' in config.plantuml ) {
      normalized.plantuml.externalServerUrl = String ( config.plantuml.externalServerUrl || '' ).trim ();
    }

    if ( GlobalConfig.isRecord ( config.plantuml ) && 'requestTimeoutMs' in config.plantuml ) {
      const timeout = Number ( config.plantuml.requestTimeoutMs );

      if ( Number.isFinite ( timeout ) ) {
        normalized.plantuml.requestTimeoutMs = Math.max ( 1000, Math.min ( 120000, Math.round ( timeout ) ) );
      }
    }

    if ( GlobalConfig.isRecord ( config.plantuml ) && 'cacheMaxEntries' in config.plantuml ) {
      const cacheMaxEntries = Number ( config.plantuml.cacheMaxEntries );

      if ( Number.isFinite ( cacheMaxEntries ) ) {
        normalized.plantuml.cacheMaxEntries = Math.max ( 20, Math.min ( 5000, Math.round ( cacheMaxEntries ) ) );
      }
    }

    if ( GlobalConfig.isRecord ( config.plantuml ) && 'cacheMaxBytes' in config.plantuml ) {
      const cacheMaxBytes = Number ( config.plantuml.cacheMaxBytes );

      if ( Number.isFinite ( cacheMaxBytes ) ) {
        normalized.plantuml.cacheMaxBytes = Math.max ( 1 * 1024 * 1024, Math.min ( 512 * 1024 * 1024, Math.round ( cacheMaxBytes ) ) );
      }
    }

    return normalized;

  },

  read ( cwd?: string ): GlobalConfigShape {

    const filePath = GlobalConfig.resolvePath ( cwd );

    if ( !filePath ) return GlobalConfig.cloneDefaults ();

    try {
      const content = fs.readFileSync ( filePath, 'utf8' ),
            parsed = GlobalConfig.parse ( content, filePath );

      return GlobalConfig.normalize ( parsed );
    } catch ( error ) {
      console.error ( `[config] Failed to load global config from "${filePath}"`, error );
      return GlobalConfig.cloneDefaults ();
    }

  },

  resolveWritablePath ( cwd?: string ): string | undefined {

    if ( !cwd ) return;

    return GlobalConfig.resolvePath ( cwd ) || path.join ( cwd, '.el-baton.yml' );

  },

  serialize ( config: GlobalConfigShape, filePath: string ): string {

    const normalized = GlobalConfig.normalize ( config ),
          ext = path.extname ( filePath ).toLowerCase ();

    if ( ext === '.json' ) {
      return `${JSON.stringify ( normalized, null, 2 )}\n`;
    }

    return dumpYAML ( normalized, {
      lineWidth: 120,
      noRefs: true
    });

  },

  write ( cwd: string | undefined, config: GlobalConfigShape ): string | undefined {

    const filePath = GlobalConfig.resolveWritablePath ( cwd );

    if ( !filePath ) return;

    const content = GlobalConfig.serialize ( config, filePath );

    fs.writeFileSync ( filePath, content, 'utf8' );

    return filePath;

  }

};

/* EXPORT */

export type {GlobalConfigShape, MonacoLineNumbersMode};
export default GlobalConfig;
