"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const global_config_1 = require("../../src/common/global_config");
/* HELPERS */
const withTempDir = (callback) => {
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'el-baton-config-'));
    try {
        callback(dirPath);
    }
    finally {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
};
/* TESTS */
(0, node_test_1.test)('read: prefers the first supported config file and parses yaml overrides', () => {
    withTempDir(dirPath => {
        fs.writeFileSync(path.join(dirPath, 'config.json'), JSON.stringify({
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
            },
            plantuml: {
                externalServerUrl: '',
                requestTimeoutMs: 12000,
                cacheMaxEntries: 400,
                cacheMaxBytes: 64 * 1024 * 1024
            }
        }), 'utf8');
        fs.writeFileSync(path.join(dirPath, '.notable.yml'), [
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
            '    tabSize: 3',
            'plantuml:',
            '  externalServerUrl: https://plantuml.example.com/plantuml',
            '  requestTimeoutMs: 9000',
            '  cacheMaxEntries: 600',
            '  cacheMaxBytes: 12582912'
        ].join('\n'), 'utf8');
        const config = global_config_1.default.read(dirPath);
        assert.equal(config.autoupdate, false);
        assert.equal(config.ui.disableAnimations, true);
        assert.equal(config.input.disableMiddleClickPaste, true);
        assert.equal(config.preview.largeNoteFullRenderDelay, 750);
        assert.equal(config.preview.disableScriptSanitization, true);
        assert.equal(config.monaco.tableFormattingDelay, 2000);
        assert.equal(config.monaco.editorOptions.lineNumbers, 'relative');
        assert.equal(config.monaco.editorOptions.disableSuggestions, true);
        assert.equal(config.monaco.editorOptions.tabSize, 3);
        assert.equal(config.plantuml.externalServerUrl, 'https://plantuml.example.com/plantuml');
        assert.equal(config.plantuml.requestTimeoutMs, 9000);
        assert.equal(config.plantuml.cacheMaxEntries, 600);
        assert.equal(config.plantuml.cacheMaxBytes, 12582912);
    });
});
(0, node_test_1.test)('read: returns defaults when no config file is present', () => {
    withTempDir(dirPath => {
        const config = global_config_1.default.read(dirPath);
        assert.deepEqual(config, global_config_1.default.defaults);
    });
});
(0, node_test_1.test)('normalize: ignores unsupported values and preserves safe defaults', () => {
    const config = global_config_1.default.normalize({
        autoupdate: 0,
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
        },
        plantuml: {
            externalServerUrl: '  https://plantuml.example.com/plantuml  ',
            requestTimeoutMs: -1,
            cacheMaxEntries: 999999,
            cacheMaxBytes: 1234
        }
    });
    assert.equal(config.autoupdate, false);
    assert.equal(config.ui.disableAnimations, true);
    assert.equal(config.input.disableMiddleClickPaste, true);
    assert.equal(config.preview.largeNoteFullRenderDelay, 0);
    assert.equal(config.preview.disableScriptSanitization, true);
    assert.equal(config.monaco.tableFormattingDelay, 5000);
    assert.equal(config.monaco.editorOptions.lineNumbers, 'on');
    assert.equal(config.monaco.editorOptions.disableSuggestions, true);
    assert.equal(config.monaco.editorOptions.tabSize, 8);
    assert.equal(config.plantuml.externalServerUrl, 'https://plantuml.example.com/plantuml');
    assert.equal(config.plantuml.requestTimeoutMs, 1000);
    assert.equal(config.plantuml.cacheMaxEntries, 5000);
    assert.equal(config.plantuml.cacheMaxBytes, 1 * 1024 * 1024);
});
(0, node_test_1.test)('write: persists normalized config and read returns the saved values', () => {
    withTempDir(dirPath => {
        const filePath = global_config_1.default.write(dirPath, {
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
            },
            plantuml: {
                externalServerUrl: 'https://plantuml.example.com/plantuml',
                requestTimeoutMs: 8000,
                cacheMaxEntries: 350,
                cacheMaxBytes: 32 * 1024 * 1024
            }
        });
        assert.equal(filePath, path.join(dirPath, '.el-baton.yml'));
        assert.equal(fs.existsSync(filePath), true);
        const config = global_config_1.default.read(dirPath);
        assert.equal(config.autoupdate, false);
        assert.equal(config.ui.disableAnimations, true);
        assert.equal(config.input.disableMiddleClickPaste, true);
        assert.equal(config.preview.largeNoteFullRenderDelay, 1500);
        assert.equal(config.preview.disableScriptSanitization, true);
        assert.equal(config.monaco.tableFormattingDelay, 3000);
        assert.equal(config.monaco.editorOptions.lineNumbers, 'relative');
        assert.equal(config.monaco.editorOptions.disableSuggestions, true);
        assert.equal(config.monaco.editorOptions.tabSize, 4);
        assert.equal(config.plantuml.externalServerUrl, 'https://plantuml.example.com/plantuml');
        assert.equal(config.plantuml.requestTimeoutMs, 8000);
        assert.equal(config.plantuml.cacheMaxEntries, 350);
        assert.equal(config.plantuml.cacheMaxBytes, 32 * 1024 * 1024);
    });
});
