/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import MarkdownPath from '../../src/common/markdown_path';

/* HELPERS */

const cwd = '/workspace/data';
const notesPath = '/workspace/data/notes';
const attachmentsPath = '/workspace/data/attachments';
const sourceFilePath = '/workspace/data/notes/chem1120/ch16/lesson.md';

/* TESTS */

test ( 'resolveMarkdownRelativePath: resolves ./ paths from current note directory', () => {

  const resolved = MarkdownPath.resolveMarkdownRelativePath ( './media/image53.jpg', { cwd, notesPath, sourceFilePath } );

  assert.equal ( resolved, '/workspace/data/notes/chem1120/ch16/media/image53.jpg' );

});

test ( 'resolveMarkdownRelativePath: resolves paths without leading ./ from current note directory', () => {

  const resolved = MarkdownPath.resolveMarkdownRelativePath ( 'media/image53.jpg', { cwd, notesPath, sourceFilePath } );

  assert.equal ( resolved, '/workspace/data/notes/chem1120/ch16/media/image53.jpg' );

});

test ( 'resolveMarkdownRelativePath: falls back to notes root if source path is missing', () => {

  const resolved = MarkdownPath.resolveMarkdownRelativePath ( 'media/image53.jpg', { cwd, notesPath } );

  assert.equal ( resolved, '/workspace/data/notes/media/image53.jpg' );

});

test ( 'resolveMarkdownRelativePath: blocks traversal escaping cwd', () => {

  const resolved = MarkdownPath.resolveMarkdownRelativePath ( '../../../../../../etc/passwd', { cwd, notesPath, sourceFilePath } );

  assert.equal ( resolved, undefined );

});

test ( 'resolveMarkdownRelativePath: ignores anchor and external/protocol paths', () => {

  assert.equal ( MarkdownPath.resolveMarkdownRelativePath ( '#section-1', { cwd, notesPath, sourceFilePath } ), undefined );
  assert.equal ( MarkdownPath.resolveMarkdownRelativePath ( 'https://example.com/a.jpg', { cwd, notesPath, sourceFilePath } ), undefined );
  assert.equal ( MarkdownPath.resolveMarkdownRelativePath ( 'file:///etc/passwd', { cwd, notesPath, sourceFilePath } ), undefined );
  assert.equal ( MarkdownPath.resolveMarkdownRelativePath ( '@note/abc.md', { cwd, notesPath, sourceFilePath } ), undefined );

});

test ( 'resolveMarkdownRelativePath: supports parent traversal only within cwd', () => {

  const resolved = MarkdownPath.resolveMarkdownRelativePath ( '../../shared/image.png', { cwd, notesPath, sourceFilePath } );

  assert.equal ( resolved, '/workspace/data/notes/shared/image.png' );

});

test ( 'resolveMarkdownRelativePath: blocks absolute and repeated traversal escape attempts', () => {

  const absolute = MarkdownPath.resolveMarkdownRelativePath ( '/etc/passwd', { cwd, notesPath, sourceFilePath } ),
        repeatedTraversal = MarkdownPath.resolveMarkdownRelativePath ( '../../.././../../../etc/passwd', { cwd, notesPath, sourceFilePath } );

  assert.equal ( absolute, undefined );
  assert.equal ( repeatedTraversal, undefined );

});

test ( 'resolveMarkdownRelativePath: treats encoded traversal as plain segments (caller can decode first)', () => {

  const encodedTraversal = MarkdownPath.resolveMarkdownRelativePath ( '%2e%2e/%2e%2e/etc/passwd', { cwd, notesPath, sourceFilePath } );

  assert.equal ( encodedTraversal, '/workspace/data/notes/chem1120/ch16/%2e%2e/%2e%2e/etc/passwd' );

});

test ( 'resolveTokenPath: @attachment token path stays within attachments root', () => {

  const valid = MarkdownPath.resolveTokenPath ( attachmentsPath, 'media/image53.jpg' ),
        invalid = MarkdownPath.resolveTokenPath ( attachmentsPath, '../../notes/chem1120/ch16/lesson.md' );

  assert.equal ( valid, '/workspace/data/attachments/media/image53.jpg' );
  assert.equal ( invalid, undefined );

});

test ( 'resolveTokenPath: @note token path stays within notes root', () => {

  const valid = MarkdownPath.resolveTokenPath ( notesPath, 'chem1120/ch16/media/image53.jpg' ),
        invalid = MarkdownPath.resolveTokenPath ( notesPath, '../../../etc/passwd' );

  assert.equal ( valid, '/workspace/data/notes/chem1120/ch16/media/image53.jpg' );
  assert.equal ( invalid, undefined );

});

test ( 'resolveTokenPath: blocks encoded traversal once decoded', () => {

  const encoded = '%2e%2e/%2e%2e/notes/chem1120/ch16/lesson.md',
        decoded = decodeURI ( encoded ),
        resolved = MarkdownPath.resolveTokenPath ( attachmentsPath, decoded );

  assert.equal ( resolved, undefined );

});

test ( 'resolvePathToToken: maps resolved files to @attachment and @note tokens', () => {

  const options = {
          attachmentsPath,
          attachmentsToken: '@attachment',
          notesPath,
          notesToken: '@note'
        },
        attachmentToken = MarkdownPath.resolvePathToToken ( '/workspace/data/attachments/media/image53.jpg', options ),
        noteToken = MarkdownPath.resolvePathToToken ( '/workspace/data/notes/chem1120/ch16/media/image53.jpg', options ),
        outsideToken = MarkdownPath.resolvePathToToken ( '/workspace/other/image.jpg', options );

  assert.equal ( attachmentToken, '@attachment/media/image53.jpg' );
  assert.equal ( noteToken, '@note/chem1120/ch16/media/image53.jpg' );
  assert.equal ( outsideToken, undefined );

});

test ( 'resolvePathToToken: normalizes separators in tokenized output (windows only)', { skip: process.platform !== 'win32' }, () => {

  const options = {
          attachmentsPath: 'C:\\workspace\\data\\attachments',
          attachmentsToken: '@attachment',
          notesPath: 'C:\\workspace\\data\\notes',
          notesToken: '@note'
        },
        windowsPath = 'C:\\workspace\\data\\notes\\chem1120\\ch16\\media\\image53.jpg',
        token = MarkdownPath.resolvePathToToken ( windowsPath, options );

  assert.equal ( token, '@note/chem1120/ch16/media/image53.jpg' );

});

test ( 'isPathInside: handles same path and nested paths only', () => {

  assert.equal ( MarkdownPath.isPathInside ( notesPath, notesPath ), true );
  assert.equal ( MarkdownPath.isPathInside ( notesPath, path.join ( notesPath, 'a/b.md' ) ), true );
  assert.equal ( MarkdownPath.isPathInside ( notesPath, '/workspace/data/notes-other/a.md' ), false );

});

test ( 'listPathSuggestions: suggests relative files and folders from the current note directory, including spaces', () => {

  const tempRoot = fs.mkdtempSync ( path.join ( os.tmpdir (), 'elbaton-markdown-path-' ) );

  try {
    const tempNotesPath = path.join ( tempRoot, 'notes' ),
          tempAttachmentsPath = path.join ( tempRoot, 'attachments' ),
          sourceFilePath = path.join ( tempNotesPath, 'course', 'lesson.md' );

    fs.mkdirSync ( path.join ( tempNotesPath, 'course', 'My Folder' ), { recursive: true } );
    fs.mkdirSync ( tempAttachmentsPath, { recursive: true } );
    fs.writeFileSync ( path.join ( tempNotesPath, 'course', 'My File.md' ), '' );
    fs.writeFileSync ( path.join ( tempNotesPath, 'course', 'My Folder', 'Nested File.md' ), '' );

    const suggestions = MarkdownPath.listPathSuggestions ( 'My F', {
      cwd: tempRoot,
      notesPath: tempNotesPath,
      attachmentsPath: tempAttachmentsPath,
      attachmentsToken: '@attachment',
      notesToken: '@note',
      sourceFilePath
    });

    assert.deepEqual ( suggestions, [
      { path: 'My Folder/', isDirectory: true },
      { path: 'My File.md', isDirectory: false }
    ]);
  } finally {
    fs.rmSync ( tempRoot, { recursive: true, force: true } );
  }

});

test ( 'listPathSuggestions: suggests token-prefixed attachment paths and preserves spaces', () => {

  const tempRoot = fs.mkdtempSync ( path.join ( os.tmpdir (), 'elbaton-markdown-path-' ) );

  try {
    const tempNotesPath = path.join ( tempRoot, 'notes' ),
          tempAttachmentsPath = path.join ( tempRoot, 'attachments' );

    fs.mkdirSync ( path.join ( tempAttachmentsPath, 'Screenshots' ), { recursive: true } );
    fs.mkdirSync ( tempNotesPath, { recursive: true } );
    fs.writeFileSync ( path.join ( tempAttachmentsPath, 'Screenshots', 'Home Screen.png' ), '' );

    const suggestions = MarkdownPath.listPathSuggestions ( '@attachment/Screenshots/Home S', {
      cwd: tempRoot,
      notesPath: tempNotesPath,
      attachmentsPath: tempAttachmentsPath,
      attachmentsToken: '@attachment',
      notesToken: '@note',
      sourceFilePath: path.join ( tempNotesPath, 'lesson.md' )
    });

    assert.deepEqual ( suggestions, [
      { path: '@attachment/Screenshots/Home Screen.png', isDirectory: false }
    ]);
  } finally {
    fs.rmSync ( tempRoot, { recursive: true, force: true } );
  }

});

test ( 'listPathSuggestions: suggests token roots for partial token prefixes', () => {

  const suggestions = MarkdownPath.listPathSuggestions ( '@att', {
    cwd,
    notesPath,
    attachmentsPath,
    attachmentsToken: '@attachment',
    notesToken: '@note',
    sourceFilePath
  });

  assert.deepEqual ( suggestions, [
    { path: '@attachment/', isDirectory: true }
  ]);

});
