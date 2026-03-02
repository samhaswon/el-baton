"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const markdown_path_1 = require("../../src/common/markdown_path");
/* HELPERS */
const cwd = '/workspace/data';
const notesPath = '/workspace/data/notes';
const attachmentsPath = '/workspace/data/attachments';
const sourceFilePath = '/workspace/data/notes/chem1120/ch16/lesson.md';
/* TESTS */
(0, node_test_1.test)('resolveMarkdownRelativePath: resolves ./ paths from current note directory', () => {
    const resolved = markdown_path_1.default.resolveMarkdownRelativePath('./media/image53.jpg', { cwd, notesPath, sourceFilePath });
    assert.equal(resolved, '/workspace/data/notes/chem1120/ch16/media/image53.jpg');
});
(0, node_test_1.test)('resolveMarkdownRelativePath: resolves paths without leading ./ from current note directory', () => {
    const resolved = markdown_path_1.default.resolveMarkdownRelativePath('media/image53.jpg', { cwd, notesPath, sourceFilePath });
    assert.equal(resolved, '/workspace/data/notes/chem1120/ch16/media/image53.jpg');
});
(0, node_test_1.test)('resolveMarkdownRelativePath: falls back to notes root if source path is missing', () => {
    const resolved = markdown_path_1.default.resolveMarkdownRelativePath('media/image53.jpg', { cwd, notesPath });
    assert.equal(resolved, '/workspace/data/notes/media/image53.jpg');
});
(0, node_test_1.test)('resolveMarkdownRelativePath: blocks traversal escaping cwd', () => {
    const resolved = markdown_path_1.default.resolveMarkdownRelativePath('../../../../../../etc/passwd', { cwd, notesPath, sourceFilePath });
    assert.equal(resolved, undefined);
});
(0, node_test_1.test)('resolveMarkdownRelativePath: ignores anchor and external/protocol paths', () => {
    assert.equal(markdown_path_1.default.resolveMarkdownRelativePath('#section-1', { cwd, notesPath, sourceFilePath }), undefined);
    assert.equal(markdown_path_1.default.resolveMarkdownRelativePath('https://example.com/a.jpg', { cwd, notesPath, sourceFilePath }), undefined);
    assert.equal(markdown_path_1.default.resolveMarkdownRelativePath('file:///etc/passwd', { cwd, notesPath, sourceFilePath }), undefined);
    assert.equal(markdown_path_1.default.resolveMarkdownRelativePath('@note/abc.md', { cwd, notesPath, sourceFilePath }), undefined);
});
(0, node_test_1.test)('resolveMarkdownRelativePath: supports parent traversal only within cwd', () => {
    const resolved = markdown_path_1.default.resolveMarkdownRelativePath('../../shared/image.png', { cwd, notesPath, sourceFilePath });
    assert.equal(resolved, '/workspace/data/notes/shared/image.png');
});
(0, node_test_1.test)('resolveMarkdownRelativePath: blocks absolute and repeated traversal escape attempts', () => {
    const absolute = markdown_path_1.default.resolveMarkdownRelativePath('/etc/passwd', { cwd, notesPath, sourceFilePath }), repeatedTraversal = markdown_path_1.default.resolveMarkdownRelativePath('../../.././../../../etc/passwd', { cwd, notesPath, sourceFilePath });
    assert.equal(absolute, undefined);
    assert.equal(repeatedTraversal, undefined);
});
(0, node_test_1.test)('resolveMarkdownRelativePath: treats encoded traversal as plain segments (caller can decode first)', () => {
    const encodedTraversal = markdown_path_1.default.resolveMarkdownRelativePath('%2e%2e/%2e%2e/etc/passwd', { cwd, notesPath, sourceFilePath });
    assert.equal(encodedTraversal, '/workspace/data/notes/chem1120/ch16/%2e%2e/%2e%2e/etc/passwd');
});
(0, node_test_1.test)('resolveTokenPath: @attachment token path stays within attachments root', () => {
    const valid = markdown_path_1.default.resolveTokenPath(attachmentsPath, 'media/image53.jpg'), invalid = markdown_path_1.default.resolveTokenPath(attachmentsPath, '../../notes/chem1120/ch16/lesson.md');
    assert.equal(valid, '/workspace/data/attachments/media/image53.jpg');
    assert.equal(invalid, undefined);
});
(0, node_test_1.test)('resolveTokenPath: @note token path stays within notes root', () => {
    const valid = markdown_path_1.default.resolveTokenPath(notesPath, 'chem1120/ch16/media/image53.jpg'), invalid = markdown_path_1.default.resolveTokenPath(notesPath, '../../../etc/passwd');
    assert.equal(valid, '/workspace/data/notes/chem1120/ch16/media/image53.jpg');
    assert.equal(invalid, undefined);
});
(0, node_test_1.test)('resolveTokenPath: blocks encoded traversal once decoded', () => {
    const encoded = '%2e%2e/%2e%2e/notes/chem1120/ch16/lesson.md', decoded = decodeURI(encoded), resolved = markdown_path_1.default.resolveTokenPath(attachmentsPath, decoded);
    assert.equal(resolved, undefined);
});
(0, node_test_1.test)('resolvePathToToken: maps resolved files to @attachment and @note tokens', () => {
    const options = {
        attachmentsPath,
        attachmentsToken: '@attachment',
        notesPath,
        notesToken: '@note'
    }, attachmentToken = markdown_path_1.default.resolvePathToToken('/workspace/data/attachments/media/image53.jpg', options), noteToken = markdown_path_1.default.resolvePathToToken('/workspace/data/notes/chem1120/ch16/media/image53.jpg', options), outsideToken = markdown_path_1.default.resolvePathToToken('/workspace/other/image.jpg', options);
    assert.equal(attachmentToken, '@attachment/media/image53.jpg');
    assert.equal(noteToken, '@note/chem1120/ch16/media/image53.jpg');
    assert.equal(outsideToken, undefined);
});
(0, node_test_1.test)('resolvePathToToken: normalizes separators in tokenized output (windows only)', { skip: process.platform !== 'win32' }, () => {
    const options = {
        attachmentsPath: 'C:\\workspace\\data\\attachments',
        attachmentsToken: '@attachment',
        notesPath: 'C:\\workspace\\data\\notes',
        notesToken: '@note'
    }, windowsPath = 'C:\\workspace\\data\\notes\\chem1120\\ch16\\media\\image53.jpg', token = markdown_path_1.default.resolvePathToToken(windowsPath, options);
    assert.equal(token, '@note/chem1120/ch16/media/image53.jpg');
});
(0, node_test_1.test)('isPathInside: handles same path and nested paths only', () => {
    assert.equal(markdown_path_1.default.isPathInside(notesPath, notesPath), true);
    assert.equal(markdown_path_1.default.isPathInside(notesPath, path.join(notesPath, 'a/b.md')), true);
    assert.equal(markdown_path_1.default.isPathInside(notesPath, '/workspace/data/notes-other/a.md'), false);
});
