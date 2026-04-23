/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import {ensureOpenTab, normalizeOpenTabs, removeOpenTab, reorderOpenTabs, replaceOpenTab} from '../../src/common/editor_tabs';

/* TESTS */

test ( 'editor tabs: normalizes duplicate and empty entries', () => {

  assert.deepEqual ( normalizeOpenTabs ( ['a', '', 'b', 'a', undefined as any] ), ['a', 'b'] );

} );

test ( 'editor tabs: ensures the active tab is appended once', () => {

  assert.deepEqual ( ensureOpenTab ( ['a', 'b'], 'c' ), ['a', 'b', 'c'] );
  assert.deepEqual ( ensureOpenTab ( ['a', 'b', 'c'], 'c' ), ['a', 'b', 'c'] );

} );

test ( 'editor tabs: removes a closed tab path', () => {

  assert.deepEqual ( removeOpenTab ( ['a', 'b', 'c'], 'b' ), ['a', 'c'] );

} );

test ( 'editor tabs: replaces a renamed tab path while preserving order', () => {

  assert.deepEqual ( replaceOpenTab ( ['a', 'b', 'c'], 'b', 'd' ), ['a', 'd', 'c'] );

} );

test ( 'editor tabs: reorders tabs before and after a target', () => {

  assert.deepEqual ( reorderOpenTabs ( ['a', 'b', 'c', 'd'], 'd', 'b', 'before' ), ['a', 'd', 'b', 'c'] );
  assert.deepEqual ( reorderOpenTabs ( ['a', 'b', 'c', 'd'], 'a', 'c', 'after' ), ['b', 'c', 'a', 'd'] );

} );
