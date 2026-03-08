/* IMPORT */

import * as fs from 'fs';
import * as path from 'path';
import {dump as dumpYAML, load as loadYAML} from 'js-yaml';

/* TYPES */

type MonacoLineNumbersMode = 'off' | 'on' | 'relative';
type BatteryTargetFps = 5 | 10 | 15 | 20 | 30 | 60;

type GlobalConfigShape = {
  autoupdate: boolean,
  performance: {
    highPerformanceMode: boolean
  },
  battery: {
    enabled: boolean,
    autoDetect: boolean,
    targetFps: BatteryTargetFps,
    optimizeRendering: boolean,
    renderDelayMs: number,
    disableSpellcheck: boolean,
    disableAutocomplete: boolean,
    disableAnimations: boolean
  },
  spellcheck: {
    addedWords: string[]
    disable: boolean
  },
  notes: {
    disableAutomaticRenaming: boolean
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
    disableSplitViewSync: boolean
  },
  monaco: {
    tableFormattingDelay: number,
    disableAutomaticTableFormatting: boolean,
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
  performance: {
    highPerformanceMode: false
  },
  battery: {
    enabled: false,
    autoDetect: true,
    targetFps: 30,
    optimizeRendering: true,
    renderDelayMs: 400,
    disableSpellcheck: false,
    disableAutocomplete: false,
    disableAnimations: true
  },
  spellcheck: {
    addedWords: [],
    disable: false
  },
  notes: {
    disableAutomaticRenaming: false
  },
  ui: {
    disableAnimations: false
  },
  input: {
    disableMiddleClickPaste: false
  },
  preview: {
    largeNoteFullRenderDelay: 500,
    disableScriptSanitization: false,
    disableSplitViewSync: false
  },
  monaco: {
    tableFormattingDelay: 2000,
    disableAutomaticTableFormatting: false,
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
      performance: {
        highPerformanceMode: DEFAULTS.performance.highPerformanceMode
      },
      battery: {
        enabled: DEFAULTS.battery.enabled,
        autoDetect: DEFAULTS.battery.autoDetect,
        targetFps: DEFAULTS.battery.targetFps,
        optimizeRendering: DEFAULTS.battery.optimizeRendering,
        renderDelayMs: DEFAULTS.battery.renderDelayMs,
        disableSpellcheck: DEFAULTS.battery.disableSpellcheck,
        disableAutocomplete: DEFAULTS.battery.disableAutocomplete,
        disableAnimations: DEFAULTS.battery.disableAnimations
      },
      spellcheck: {
        addedWords: [...DEFAULTS.spellcheck.addedWords],
        disable: DEFAULTS.spellcheck.disable
      },
      notes: {
        disableAutomaticRenaming: DEFAULTS.notes.disableAutomaticRenaming
      },
      ui: {
        disableAnimations: DEFAULTS.ui.disableAnimations
      },
      input: {
        disableMiddleClickPaste: DEFAULTS.input.disableMiddleClickPaste
      },
      preview: {
        largeNoteFullRenderDelay: DEFAULTS.preview.largeNoteFullRenderDelay,
        disableScriptSanitization: DEFAULTS.preview.disableScriptSanitization,
        disableSplitViewSync: DEFAULTS.preview.disableSplitViewSync
      },
      monaco: {
        tableFormattingDelay: DEFAULTS.monaco.tableFormattingDelay,
        disableAutomaticTableFormatting: DEFAULTS.monaco.disableAutomaticTableFormatting,
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

    if ( GlobalConfig.isRecord ( config.performance ) && 'highPerformanceMode' in config.performance ) {
      normalized.performance.highPerformanceMode = !!config.performance.highPerformanceMode;
    }

    if ( GlobalConfig.isRecord ( config.battery ) && 'enabled' in config.battery ) {
      normalized.battery.enabled = !!config.battery.enabled;
    }

    if ( GlobalConfig.isRecord ( config.battery ) && 'autoDetect' in config.battery ) {
      normalized.battery.autoDetect = !!config.battery.autoDetect;
    }

    if ( GlobalConfig.isRecord ( config.battery ) && 'targetFps' in config.battery ) {
      const targetFps = Number ( config.battery.targetFps );

      if ( targetFps === 5 || targetFps === 10 || targetFps === 15 || targetFps === 20 || targetFps === 30 || targetFps === 60 ) {
        normalized.battery.targetFps = targetFps;
      }
    }

    if ( GlobalConfig.isRecord ( config.battery ) && 'optimizeRendering' in config.battery ) {
      normalized.battery.optimizeRendering = !!config.battery.optimizeRendering;
    }

    if ( GlobalConfig.isRecord ( config.battery ) && 'renderDelayMs' in config.battery ) {
      const delay = Number ( config.battery.renderDelayMs );

      if ( Number.isFinite ( delay ) ) {
        normalized.battery.renderDelayMs = Math.max ( 0, Math.min ( 5000, Math.round ( delay ) ) );
      }
    }

    if ( GlobalConfig.isRecord ( config.battery ) && 'disableSpellcheck' in config.battery ) {
      normalized.battery.disableSpellcheck = !!config.battery.disableSpellcheck;
    }

    if ( GlobalConfig.isRecord ( config.battery ) && 'disableAutocomplete' in config.battery ) {
      normalized.battery.disableAutocomplete = !!config.battery.disableAutocomplete;
    }

    if ( GlobalConfig.isRecord ( config.battery ) && 'disableAnimations' in config.battery ) {
      normalized.battery.disableAnimations = !!config.battery.disableAnimations;
    }

    if ( GlobalConfig.isRecord ( config.spellcheck ) && 'addedWords' in config.spellcheck ) {
      normalized.spellcheck.addedWords = GlobalConfig.normalizeSpellcheckWords ( config.spellcheck.addedWords );
    }

    if ( GlobalConfig.isRecord ( config.spellcheck ) && 'disable' in config.spellcheck ) {
      normalized.spellcheck.disable = !!config.spellcheck.disable;
    }

    if ( GlobalConfig.isRecord ( config.notes ) && 'disableAutomaticRenaming' in config.notes ) {
      normalized.notes.disableAutomaticRenaming = !!config.notes.disableAutomaticRenaming;
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

    if ( GlobalConfig.isRecord ( config.preview ) && 'disableSplitViewSync' in config.preview ) {
      normalized.preview.disableSplitViewSync = !!config.preview.disableSplitViewSync;
    }

    if ( GlobalConfig.isRecord ( config.monaco ) && 'tableFormattingDelay' in config.monaco ) {
      const delay = Number ( config.monaco.tableFormattingDelay );

      if ( Number.isFinite ( delay ) ) {
        normalized.monaco.tableFormattingDelay = Math.max ( 0, Math.min ( 5000, Math.round ( delay ) ) );
      }
    }

    if ( GlobalConfig.isRecord ( config.monaco ) && 'disableAutomaticTableFormatting' in config.monaco ) {
      normalized.monaco.disableAutomaticTableFormatting = !!config.monaco.disableAutomaticTableFormatting;
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

export type {GlobalConfigShape, MonacoLineNumbersMode, BatteryTargetFps};
export default GlobalConfig;
