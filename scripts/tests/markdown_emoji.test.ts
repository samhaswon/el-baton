/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import Module = require ( 'node:module' );

/* MODULE SETUP */

const compiledRoot = path.resolve ( __dirname, '..', '..' );
const originalLoad = ( Module as any )._load;

const resolveAlias = ( request: string ): string | undefined => {

  if ( request.startsWith ( '@common/' ) ) {
    return path.join ( compiledRoot, 'src/common', request.slice ( '@common/'.length ) );
  }

  if ( request.startsWith ( '@renderer/' ) ) {
    return path.join ( compiledRoot, 'src/renderer', request.slice ( '@renderer/'.length ) );
  }

  if ( request.startsWith ( '@root/' ) ) {
    return path.join ( compiledRoot, request.slice ( '@root/'.length ) );
  }

  if ( request === 'overstated' ) {
    return path.join ( compiledRoot, 'src/renderer/lib/overstated' );
  }

};

( Module as any )._load = function patchedLoad ( request: string, parent: NodeModule, isMain: boolean ) {

  if ( request === 'electron-store' ) {
    return {
      __esModule: true,
      default: class ElectronStoreMock {
        get () {
          return undefined;
        }

        set () {}
      }
    };
  }

  if ( request === 'electron' ) {
    return {};
  }

  const resolved = resolveAlias ( request );

  if ( resolved ) {
    return originalLoad.call ( this, resolved, parent, isMain );
  }

  return originalLoad.call ( this, request, parent, isMain );

};

( globalThis as any ).__static = path.join ( compiledRoot, 'src/renderer/template/runtime' );
( globalThis as any ).$ = Object.assign (() => undefined, {
  isEditable: () => false,
  $document: {},
  $window: {}
} );

const Markdown = require ( '../../src/renderer/utils/markdown' ).default;

Markdown.setRuntimeConfig ({
  cwd: undefined,
  notesPath: undefined,
  attachmentsPath: undefined,
  mermaidTheme: 'default',
  notesToken: '@note',
  attachmentsToken: '@attachment',
  tagsToken: '@tag',
  notesExt: '.md',
  notesReSource: '\\.(?:md)$',
  notesReFlags: '',
  disableScriptSanitization: false,
  katex: {
    throwOnError: false,
    strict: 'ignore',
    displayMode: false,
    errorColor: '#F44336'
  }
} );

/* TESTS */

test ( 'markdown emoji: replaces mermaid shortcodes during markdown preprocessing', () => {

  const output = Markdown.preprocessForCmark ( 'Diagram :mermaid: ready' );

  assert.equal ( output, 'Diagram 🧜‍♀️ ready' );

} );

test ( 'markdown emoji: replaces shortcodes in the middle of a line', () => {

  const output = Markdown.preprocessForCmark ( '- [ ] Some emojis :question: appear mid-line' );

  assert.equal ( output, '- [ ] Some emojis ❓ appear mid-line' );

} );

test ( 'markdown emoji: preserves shortcodes inside inline code spans', () => {

  const output = Markdown.preprocessForCmark ( 'Code `:question:` text :question:' );

  assert.equal ( output, 'Code `:question:` text ❓' );

} );
