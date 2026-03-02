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
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'notable-config-'));
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
            input: {
                disableMiddleClickPaste: false
            },
            preview: {
                largeNoteFullRenderDelay: 1000
            },
            monaco: {
                editorOptions: {
                    lineNumbers: 'off'
                }
            }
        }), 'utf8');
        fs.writeFileSync(path.join(dirPath, '.notable.yml'), [
            'autoupdate: false',
            'input:',
            '  disableMiddleClickPaste: true',
            'preview:',
            '  largeNoteFullRenderDelay: 750',
            'monaco:',
            '  editorOptions:',
            '    lineNumbers: relative'
        ].join('\n'), 'utf8');
        const config = global_config_1.default.read(dirPath);
        assert.equal(config.autoupdate, false);
        assert.equal(config.input.disableMiddleClickPaste, true);
        assert.equal(config.preview.largeNoteFullRenderDelay, 750);
        assert.equal(config.monaco.editorOptions.lineNumbers, 'relative');
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
        preview: {
            largeNoteFullRenderDelay: -40
        },
        monaco: {
            editorOptions: {
                lineNumbers: 'vim'
            }
        }
    });
    assert.equal(config.autoupdate, false);
    assert.equal(config.input.disableMiddleClickPaste, true);
    assert.equal(config.preview.largeNoteFullRenderDelay, 0);
    assert.equal(config.monaco.editorOptions.lineNumbers, 'on');
});
(0, node_test_1.test)('write: persists normalized config and read returns the saved values', () => {
    withTempDir(dirPath => {
        const filePath = global_config_1.default.write(dirPath, {
            autoupdate: false,
            input: {
                disableMiddleClickPaste: true
            },
            preview: {
                largeNoteFullRenderDelay: 1500
            },
            monaco: {
                editorOptions: {
                    lineNumbers: 'relative'
                }
            }
        });
        assert.equal(filePath, path.join(dirPath, '.el-baton.yml'));
        assert.equal(fs.existsSync(filePath), true);
        const config = global_config_1.default.read(dirPath);
        assert.equal(config.autoupdate, false);
        assert.equal(config.input.disableMiddleClickPaste, true);
        assert.equal(config.preview.largeNoteFullRenderDelay, 1500);
        assert.equal(config.monaco.editorOptions.lineNumbers, 'relative');
    });
});
