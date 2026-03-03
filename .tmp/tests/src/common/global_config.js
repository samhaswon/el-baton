"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const js_yaml_1 = require("js-yaml");
/* GLOBAL CONFIG */
const DEFAULTS = {
    autoupdate: true,
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
    isRecord(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    },
    cloneDefaults() {
        return {
            autoupdate: DEFAULTS.autoupdate,
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
            }
        };
    },
    resolvePath(cwd) {
        if (!cwd)
            return;
        for (let index = 0, l = FILE_NAMES.length; index < l; index++) {
            const filePath = path.join(cwd, FILE_NAMES[index]);
            try {
                if (fs.statSync(filePath).isFile())
                    return filePath;
            }
            catch (error) {
                continue;
            }
        }
    },
    parse(content, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const parsed = ext === '.json' ? JSON.parse(content) : (0, js_yaml_1.load)(content);
        return GlobalConfig.isRecord(parsed) ? parsed : undefined;
    },
    normalize(config) {
        const normalized = GlobalConfig.cloneDefaults();
        if (!GlobalConfig.isRecord(config))
            return normalized;
        if ('autoupdate' in config) {
            normalized.autoupdate = !!config.autoupdate;
        }
        if (GlobalConfig.isRecord(config.ui) && 'disableAnimations' in config.ui) {
            normalized.ui.disableAnimations = !!config.ui.disableAnimations;
        }
        if (GlobalConfig.isRecord(config.input) && 'disableMiddleClickPaste' in config.input) {
            normalized.input.disableMiddleClickPaste = !!config.input.disableMiddleClickPaste;
        }
        if (GlobalConfig.isRecord(config.preview) && 'largeNoteFullRenderDelay' in config.preview) {
            const delay = Number(config.preview.largeNoteFullRenderDelay);
            if (Number.isFinite(delay)) {
                normalized.preview.largeNoteFullRenderDelay = Math.max(0, Math.min(5000, Math.round(delay)));
            }
        }
        if (GlobalConfig.isRecord(config.preview) && 'disableScriptSanitization' in config.preview) {
            normalized.preview.disableScriptSanitization = !!config.preview.disableScriptSanitization;
        }
        if (GlobalConfig.isRecord(config.monaco) && 'tableFormattingDelay' in config.monaco) {
            const delay = Number(config.monaco.tableFormattingDelay);
            if (Number.isFinite(delay)) {
                normalized.monaco.tableFormattingDelay = Math.max(0, Math.min(5000, Math.round(delay)));
            }
        }
        if (GlobalConfig.isRecord(config.monaco) && GlobalConfig.isRecord(config.monaco.editorOptions) && 'lineNumbers' in config.monaco.editorOptions) {
            const lineNumbers = String(config.monaco.editorOptions.lineNumbers).toLowerCase();
            if (lineNumbers === 'off' || lineNumbers === 'relative' || lineNumbers === 'on') {
                normalized.monaco.editorOptions.lineNumbers = lineNumbers;
            }
        }
        if (GlobalConfig.isRecord(config.monaco) && GlobalConfig.isRecord(config.monaco.editorOptions) && 'disableSuggestions' in config.monaco.editorOptions) {
            normalized.monaco.editorOptions.disableSuggestions = !!config.monaco.editorOptions.disableSuggestions;
        }
        if (GlobalConfig.isRecord(config.monaco) && GlobalConfig.isRecord(config.monaco.editorOptions) && 'tabSize' in config.monaco.editorOptions) {
            const tabSize = Number(config.monaco.editorOptions.tabSize);
            if (Number.isFinite(tabSize)) {
                normalized.monaco.editorOptions.tabSize = Math.max(1, Math.min(8, Math.round(tabSize)));
            }
        }
        return normalized;
    },
    read(cwd) {
        const filePath = GlobalConfig.resolvePath(cwd);
        if (!filePath)
            return GlobalConfig.cloneDefaults();
        try {
            const content = fs.readFileSync(filePath, 'utf8'), parsed = GlobalConfig.parse(content, filePath);
            return GlobalConfig.normalize(parsed);
        }
        catch (error) {
            console.error(`[config] Failed to load global config from "${filePath}"`, error);
            return GlobalConfig.cloneDefaults();
        }
    },
    resolveWritablePath(cwd) {
        if (!cwd)
            return;
        return GlobalConfig.resolvePath(cwd) || path.join(cwd, '.el-baton.yml');
    },
    serialize(config, filePath) {
        const normalized = GlobalConfig.normalize(config), ext = path.extname(filePath).toLowerCase();
        if (ext === '.json') {
            return `${JSON.stringify(normalized, null, 2)}\n`;
        }
        return (0, js_yaml_1.dump)(normalized, {
            lineWidth: 120,
            noRefs: true
        });
    },
    write(cwd, config) {
        const filePath = GlobalConfig.resolveWritablePath(cwd);
        if (!filePath)
            return;
        const content = GlobalConfig.serialize(config, filePath);
        fs.writeFileSync(filePath, content, 'utf8');
        return filePath;
    }
};
exports.default = GlobalConfig;
