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
        largeNoteFullRenderDelay: 1000,
        disableScriptSanitization: false,
        disableSplitViewSync: false
      },
      monaco: {
        tableFormattingDelay: 1000,
        disableAutomaticTableFormatting: false,
        editorOptions: {
          lineNumbers: 'off',
          disableSuggestions: false,
          tabSize: 4
        }
      },
      plantuml: {
        externalServerUrl: '',
        requestTimeoutMs: 12000,
        cacheMaxEntries: 400,
        cacheMaxBytes: 64 * 1024 * 1024
      }
    }), 'utf8' );

    fs.writeFileSync ( path.join ( dirPath, '.notable.yml' ), [
      'autoupdate: false',
      'performance:',
      '  highPerformanceMode: true',
      'battery:',
      '  enabled: true',
      '  autoDetect: false',
      '  targetFps: 20',
      '  optimizeRendering: false',
      '  renderDelayMs: 750',
      '  disableSpellcheck: true',
      '  disableAutocomplete: true',
      '  disableAnimations: false',
      'spellcheck:',
      '  addedWords:',
      '    - Markdown',
      '    - TeX',
      '  disable: true',
      'notes:',
      '  disableAutomaticRenaming: true',
      'ui:',
      '  disableAnimations: true',
      'input:',
      '  disableMiddleClickPaste: true',
      'preview:',
      '  largeNoteFullRenderDelay: 750',
      '  disableScriptSanitization: true',
      '  disableSplitViewSync: true',
      'monaco:',
      '  tableFormattingDelay: 2000',
      '  disableAutomaticTableFormatting: true',
      '  editorOptions:',
      '    lineNumbers: relative',
      '    disableSuggestions: true',
      '    tabSize: 3',
      'plantuml:',
      '  externalServerUrl: https://plantuml.example.com/plantuml',
      '  requestTimeoutMs: 9000',
      '  cacheMaxEntries: 600',
      '  cacheMaxBytes: 12582912'
    ].join ( '\n' ), 'utf8' );

    const config = GlobalConfig.read ( dirPath );

    assert.equal ( config.autoupdate, false );
    assert.equal ( config.performance.highPerformanceMode, true );
    assert.equal ( config.battery.enabled, true );
    assert.equal ( config.battery.autoDetect, false );
    assert.equal ( config.battery.targetFps, 20 );
    assert.equal ( config.battery.optimizeRendering, false );
    assert.equal ( config.battery.renderDelayMs, 750 );
    assert.equal ( config.battery.disableSpellcheck, true );
    assert.equal ( config.battery.disableAutocomplete, true );
    assert.equal ( config.battery.disableAnimations, false );
    assert.deepEqual ( config.spellcheck.addedWords, ['markdown', 'tex'] );
    assert.equal ( config.spellcheck.disable, true );
    assert.equal ( config.notes.disableAutomaticRenaming, true );
    assert.equal ( config.ui.disableAnimations, true );
    assert.equal ( config.input.disableMiddleClickPaste, true );
    assert.equal ( config.preview.largeNoteFullRenderDelay, 750 );
    assert.equal ( config.preview.disableScriptSanitization, true );
    assert.equal ( config.preview.disableSplitViewSync, true );
    assert.equal ( config.monaco.tableFormattingDelay, 2000 );
    assert.equal ( config.monaco.disableAutomaticTableFormatting, true );
    assert.equal ( config.monaco.editorOptions.lineNumbers, 'relative' );
    assert.equal ( config.monaco.editorOptions.disableSuggestions, true );
    assert.equal ( config.monaco.editorOptions.tabSize, 3 );
    assert.equal ( config.plantuml.externalServerUrl, 'https://plantuml.example.com/plantuml' );
    assert.equal ( config.plantuml.requestTimeoutMs, 9000 );
    assert.equal ( config.plantuml.cacheMaxEntries, 600 );
    assert.equal ( config.plantuml.cacheMaxBytes, 12582912 );

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
    performance: {
      highPerformanceMode: 'yes'
    },
    battery: {
      enabled: 'yes',
      autoDetect: '',
      targetFps: 17,
      optimizeRendering: 1,
      renderDelayMs: 999999,
      disableSpellcheck: 'yes',
      disableAutocomplete: 'yes',
      disableAnimations: 0
    },
    spellcheck: {
      addedWords: ['  WoRd ', 'word', "O'Reilly", 'x', '123', '$bad' ],
      disable: 'yes'
    },
    notes: {
      disableAutomaticRenaming: 'yes'
    },
    input: {
      disableMiddleClickPaste: 'yes'
    },
    ui: {
      disableAnimations: 'yes'
    },
    preview: {
      largeNoteFullRenderDelay: -40,
      disableScriptSanitization: 'yes',
      disableSplitViewSync: 'yes'
    },
    monaco: {
      tableFormattingDelay: 9000,
      disableAutomaticTableFormatting: 'yes',
      editorOptions: {
        lineNumbers: 'vim',
        disableSuggestions: 'yes',
        tabSize: 99
      }
    },
    plantuml: {
      externalServerUrl: '  https://plantuml.example.com/plantuml  ',
      requestTimeoutMs: -1,
      cacheMaxEntries: 999999,
      cacheMaxBytes: 1234
    }
  });

  assert.equal ( config.autoupdate, false );
  assert.equal ( config.performance.highPerformanceMode, true );
  assert.equal ( config.battery.enabled, true );
  assert.equal ( config.battery.autoDetect, false );
  assert.equal ( config.battery.targetFps, 30 );
  assert.equal ( config.battery.optimizeRendering, true );
  assert.equal ( config.battery.renderDelayMs, 5000 );
  assert.equal ( config.battery.disableSpellcheck, true );
  assert.equal ( config.battery.disableAutocomplete, true );
  assert.equal ( config.battery.disableAnimations, false );
  assert.deepEqual ( config.spellcheck.addedWords, ["o'reilly", 'word', 'x'] );
  assert.equal ( config.spellcheck.disable, true );
  assert.equal ( config.notes.disableAutomaticRenaming, true );
  assert.equal ( config.ui.disableAnimations, true );
  assert.equal ( config.input.disableMiddleClickPaste, true );
  assert.equal ( config.preview.largeNoteFullRenderDelay, 0 );
  assert.equal ( config.preview.disableScriptSanitization, true );
  assert.equal ( config.preview.disableSplitViewSync, true );
  assert.equal ( config.monaco.tableFormattingDelay, 5000 );
  assert.equal ( config.monaco.disableAutomaticTableFormatting, true );
  assert.equal ( config.monaco.editorOptions.lineNumbers, 'on' );
  assert.equal ( config.monaco.editorOptions.disableSuggestions, true );
  assert.equal ( config.monaco.editorOptions.tabSize, 8 );
  assert.equal ( config.plantuml.externalServerUrl, 'https://plantuml.example.com/plantuml' );
  assert.equal ( config.plantuml.requestTimeoutMs, 1000 );
  assert.equal ( config.plantuml.cacheMaxEntries, 5000 );
  assert.equal ( config.plantuml.cacheMaxBytes, 1 * 1024 * 1024 );

});

test ( 'normalize: accepts low on-battery fps options', () => {

  const lowFive = GlobalConfig.normalize ({
          battery: {
            targetFps: 5
          }
        }),
        lowTen = GlobalConfig.normalize ({
          battery: {
            targetFps: 10
          }
        });

  assert.equal ( lowFive.battery.targetFps, 5 );
  assert.equal ( lowTen.battery.targetFps, 10 );

});

test ( 'write: persists normalized config and read returns the saved values', () => {

  withTempDir ( dirPath => {

    const filePath = GlobalConfig.write ( dirPath, {
      autoupdate: false,
      performance: {
        highPerformanceMode: true
      },
      battery: {
        enabled: true,
        autoDetect: true,
        targetFps: 15,
        optimizeRendering: true,
        renderDelayMs: 1000,
        disableSpellcheck: true,
        disableAutocomplete: false,
        disableAnimations: true
      },
      spellcheck: {
        addedWords: ['markdown', 'plantuml'],
        disable: true
      },
      notes: {
        disableAutomaticRenaming: true
      },
      ui: {
        disableAnimations: true
      },
      input: {
        disableMiddleClickPaste: true
      },
      preview: {
        largeNoteFullRenderDelay: 1500,
        disableScriptSanitization: true,
        disableSplitViewSync: true
      },
      monaco: {
        tableFormattingDelay: 3000,
        disableAutomaticTableFormatting: true,
        editorOptions: {
          lineNumbers: 'relative',
          disableSuggestions: true,
          tabSize: 4
        }
      },
      plantuml: {
        externalServerUrl: 'https://plantuml.example.com/plantuml',
        requestTimeoutMs: 8000,
        cacheMaxEntries: 350,
        cacheMaxBytes: 32 * 1024 * 1024
      }
    });

    assert.equal ( filePath, path.join ( dirPath, '.el-baton.yml' ) );
    assert.equal ( fs.existsSync ( filePath! ), true );

    const config = GlobalConfig.read ( dirPath );

    assert.equal ( config.autoupdate, false );
    assert.equal ( config.performance.highPerformanceMode, true );
    assert.equal ( config.battery.enabled, true );
    assert.equal ( config.battery.autoDetect, true );
    assert.equal ( config.battery.targetFps, 15 );
    assert.equal ( config.battery.optimizeRendering, true );
    assert.equal ( config.battery.renderDelayMs, 1000 );
    assert.equal ( config.battery.disableSpellcheck, true );
    assert.equal ( config.battery.disableAutocomplete, false );
    assert.equal ( config.battery.disableAnimations, true );
    assert.deepEqual ( config.spellcheck.addedWords, ['markdown', 'plantuml'] );
    assert.equal ( config.spellcheck.disable, true );
    assert.equal ( config.notes.disableAutomaticRenaming, true );
    assert.equal ( config.ui.disableAnimations, true );
    assert.equal ( config.input.disableMiddleClickPaste, true );
    assert.equal ( config.preview.largeNoteFullRenderDelay, 1500 );
    assert.equal ( config.preview.disableScriptSanitization, true );
    assert.equal ( config.preview.disableSplitViewSync, true );
    assert.equal ( config.monaco.tableFormattingDelay, 3000 );
    assert.equal ( config.monaco.disableAutomaticTableFormatting, true );
    assert.equal ( config.monaco.editorOptions.lineNumbers, 'relative' );
    assert.equal ( config.monaco.editorOptions.disableSuggestions, true );
    assert.equal ( config.monaco.editorOptions.tabSize, 4 );
    assert.equal ( config.plantuml.externalServerUrl, 'https://plantuml.example.com/plantuml' );
    assert.equal ( config.plantuml.requestTimeoutMs, 8000 );
    assert.equal ( config.plantuml.cacheMaxEntries, 350 );
    assert.equal ( config.plantuml.cacheMaxBytes, 32 * 1024 * 1024 );

  });

});
