/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import NaturalSort from '../../src/common/natural_sort';

/* TESTS */

test ( 'compareStrings: sorts numeric segments naturally', () => {

  const titles = ['Note 10', 'Note 2', 'Note 1'],
        sorted = titles.slice ().sort ( NaturalSort.compareStrings );

  assert.deepEqual ( sorted, ['Note 1', 'Note 2', 'Note 10'] );

});

test ( 'sortBy: sorts case-insensitively in ascending order', () => {

  const notes = [{ title: 'note 12' }, { title: 'Note 3' }, { title: 'note 1' }],
        sorted = NaturalSort.sortBy ( notes, note => note.title );

  assert.deepEqual ( sorted.map ( note => note.title ), ['note 1', 'Note 3', 'note 12'] );

});

test ( 'sortBy: supports descending order', () => {

  const notes = [{ title: 'Chapter 2' }, { title: 'Chapter 11' }, { title: 'Chapter 1' }],
        sorted = NaturalSort.sortBy ( notes, note => note.title, 'descending' );

  assert.deepEqual ( sorted.map ( note => note.title ), ['Chapter 11', 'Chapter 2', 'Chapter 1'] );

});
