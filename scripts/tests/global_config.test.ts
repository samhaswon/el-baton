/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import GlobalConfig from '../../src/common/global_config';

/* HELPERS */

const withTempDir = ( callback: ( dirPath: string ) => void ) => {

  const dirPath = fs.mkdtempSync ( path.join ( os.tmpdir (), 'el-baton-config-' ) );

  try {
    callback ( dirPath );
  } finally {
    fs.rmSync ( dirPath, { recursive: true, force: true } );
  }

};

/* TESTS */

test ( 'read: prefers the first supported config file and parses yaml overrides', () => {

  withTempDir ( dirPath => {

    fs.writeFileSync ( path.join ( dirPath, 'config.json' ), JSON.stringify ({
      autoupdate: true,
      ui: {
        disableAnimations: false
      },
      input: {
        disableMiddleClickPaste: false
      },
      preview: {
        largeNoteFullRenderDelay: 1000,
        disableScriptSanitization: false
      },
      monaco: {
        tableFormattingDelay: 1000,
        editorOptions: {
          lineNumbers: 'off',
          disableSuggestions: false,
          tabSize: 4
        }
      }
    }), 'utf8' );

    fs.writeFileSync ( path.join ( dirPath, '.notable.yml' ), [
      'autoupdate: false',
      'ui:',
      '  disableAnimations: true',
      'input:',
      '  disableMiddleClickPaste: true',
      'preview:',
      '  largeNoteFullRenderDelay: 750',
      '  disableScriptSanitization: true',
      'monaco:',
      '  tableFormattingDelay: 2000',
      '  editorOptions:',
      '    lineNumbers: relative',
      '    disableSuggestions: true',
      '    tabSize: 3'
    ].join ( '\n' ), 'utf8' );

    const config = GlobalConfig.read ( dirPath );

    assert.equal ( config.autoupdate, false );
    assert.equal ( config.ui.disableAnimations, true );
    assert.equal ( config.input.disableMiddleClickPaste, true );
    assert.equal ( config.preview.largeNoteFullRenderDelay, 750 );
    assert.equal ( config.preview.disableScriptSanitization, true );
    assert.equal ( config.monaco.tableFormattingDelay, 2000 );
    assert.equal ( config.monaco.editorOptions.lineNumbers, 'relative' );
    assert.equal ( config.monaco.editorOptions.disableSuggestions, true );
    assert.equal ( config.monaco.editorOptions.tabSize, 3 );

  });

});

test ( 'read: returns defaults when no config file is present', () => {

  withTempDir ( dirPath => {

    const config = GlobalConfig.read ( dirPath );

    assert.deepEqual ( config, GlobalConfig.defaults );

  });

});

test ( 'normalize: ignores unsupported values and preserves safe defaults', () => {

  const config = GlobalConfig.normalize ({
    autoupdate: 0 as any,
    input: {
      disableMiddleClickPaste: 'yes'
    },
    ui: {
      disableAnimations: 'yes'
    },
    preview: {
      largeNoteFullRenderDelay: -40,
      disableScriptSanitization: 'yes'
    },
    monaco: {
      tableFormattingDelay: 9000,
      editorOptions: {
        lineNumbers: 'vim',
        disableSuggestions: 'yes',
        tabSize: 99
      }
    }
  });

  assert.equal ( config.autoupdate, false );
  assert.equal ( config.ui.disableAnimations, true );
  assert.equal ( config.input.disableMiddleClickPaste, true );
  assert.equal ( config.preview.largeNoteFullRenderDelay, 0 );
  assert.equal ( config.preview.disableScriptSanitization, true );
  assert.equal ( config.monaco.tableFormattingDelay, 5000 );
  assert.equal ( config.monaco.editorOptions.lineNumbers, 'on' );
  assert.equal ( config.monaco.editorOptions.disableSuggestions, true );
  assert.equal ( config.monaco.editorOptions.tabSize, 8 );

});

test ( 'write: persists normalized config and read returns the saved values', () => {

  withTempDir ( dirPath => {

    const filePath = GlobalConfig.write ( dirPath, {
      autoupdate: false,
      ui: {
        disableAnimations: true
      },
      input: {
        disableMiddleClickPaste: true
      },
      preview: {
        largeNoteFullRenderDelay: 1500,
        disableScriptSanitization: true
      },
      monaco: {
        tableFormattingDelay: 3000,
        editorOptions: {
          lineNumbers: 'relative',
          disableSuggestions: true,
          tabSize: 4
        }
      }
    });

    assert.equal ( filePath, path.join ( dirPath, '.el-baton.yml' ) );
    assert.equal ( fs.existsSync ( filePath! ), true );

    const config = GlobalConfig.read ( dirPath );

    assert.equal ( config.autoupdate, false );
    assert.equal ( config.ui.disableAnimations, true );
    assert.equal ( config.input.disableMiddleClickPaste, true );
    assert.equal ( config.preview.largeNoteFullRenderDelay, 1500 );
    assert.equal ( config.preview.disableScriptSanitization, true );
    assert.equal ( config.monaco.tableFormattingDelay, 3000 );
    assert.equal ( config.monaco.editorOptions.lineNumbers, 'relative' );
    assert.equal ( config.monaco.editorOptions.disableSuggestions, true );
    assert.equal ( config.monaco.editorOptions.tabSize, 4 );

  });

});
