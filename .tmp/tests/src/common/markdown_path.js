"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
/* MARKDOWN PATH */
const MarkdownPath = {
    isPathInside(parentPath, childPath) {
        const relative = path.relative(parentPath, childPath);
        return (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative)) || childPath === parentPath;
    },
    toTokenRelativePath(parentPath, childPath) {
        return path.relative(parentPath, childPath).replace(/\\/g, '/');
    },
    resolveMarkdownRelativePath(rawTarget, options) {
        const { cwd, notesPath, sourceFilePath } = options, target = rawTarget.trim();
        if (!target || target.startsWith('#') || target.startsWith('@') || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(target))
            return;
        const sourceBasePath = sourceFilePath ? path.dirname(sourceFilePath) : notesPath, resolvedPath = path.resolve(sourceBasePath, target);
        if (!MarkdownPath.isPathInside(cwd, resolvedPath))
            return;
        return resolvedPath;
    },
    resolveTokenPath(basePath, tokenPath) {
        const resolvedPath = path.resolve(basePath, tokenPath);
        if (!MarkdownPath.isPathInside(basePath, resolvedPath))
            return;
        return resolvedPath;
    },
    resolvePathToToken(filePath, options) {
        const { attachmentsPath, attachmentsToken, notesPath, notesToken } = options;
        if (MarkdownPath.isPathInside(attachmentsPath, filePath)) {
            return `${attachmentsToken}/${MarkdownPath.toTokenRelativePath(attachmentsPath, filePath)}`;
        }
        if (MarkdownPath.isPathInside(notesPath, filePath)) {
            return `${notesToken}/${MarkdownPath.toTokenRelativePath(notesPath, filePath)}`;
        }
        return;
    }
};
/* EXPORT */
exports.default = MarkdownPath;
