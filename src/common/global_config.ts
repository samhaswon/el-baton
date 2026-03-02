/* IMPORT */

import * as fs from 'fs';
import * as path from 'path';
import {dump as dumpYAML, load as loadYAML} from 'js-yaml';

/* TYPES */

type MonacoLineNumbersMode = 'off' | 'on' | 'relative';

type GlobalConfigShape = {
  autoupdate: boolean,
  input: {
    disableMiddleClickPaste: boolean
  },
  preview: {
    largeNoteFullRenderDelay: number
  },
  monaco: {
    editorOptions: {
      lineNumbers: MonacoLineNumbersMode
    }
  }
};

/* GLOBAL CONFIG */

const DEFAULTS: GlobalConfigShape = {
  autoupdate: true,
  input: {
    disableMiddleClickPaste: false
  },
  preview: {
    largeNoteFullRenderDelay: 500
  },
  monaco: {
    editorOptions: {
      lineNumbers: 'on'
    }
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

  isRecord ( value: unknown ): value is Record<string, unknown> {

    return !!value && typeof value === 'object' && !Array.isArray ( value );

  },

  cloneDefaults (): GlobalConfigShape {

    return {
      autoupdate: DEFAULTS.autoupdate,
      input: {
        disableMiddleClickPaste: DEFAULTS.input.disableMiddleClickPaste
      },
      preview: {
        largeNoteFullRenderDelay: DEFAULTS.preview.largeNoteFullRenderDelay
      },
      monaco: {
        editorOptions: {
          lineNumbers: DEFAULTS.monaco.editorOptions.lineNumbers
        }
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

    if ( GlobalConfig.isRecord ( config.input ) && 'disableMiddleClickPaste' in config.input ) {
      normalized.input.disableMiddleClickPaste = !!config.input.disableMiddleClickPaste;
    }

    if ( GlobalConfig.isRecord ( config.preview ) && 'largeNoteFullRenderDelay' in config.preview ) {
      const delay = Number ( config.preview.largeNoteFullRenderDelay );

      if ( Number.isFinite ( delay ) ) {
        normalized.preview.largeNoteFullRenderDelay = Math.max ( 0, Math.min ( 5000, Math.round ( delay ) ) );
      }
    }

    if ( GlobalConfig.isRecord ( config.monaco ) && GlobalConfig.isRecord ( config.monaco.editorOptions ) && 'lineNumbers' in config.monaco.editorOptions ) {
      const lineNumbers = String ( config.monaco.editorOptions.lineNumbers ).toLowerCase ();

      if ( lineNumbers === 'off' || lineNumbers === 'relative' || lineNumbers === 'on' ) {
        normalized.monaco.editorOptions.lineNumbers = lineNumbers;
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
