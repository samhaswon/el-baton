"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = require("node:assert/strict");
const natural_sort_1 = require("../../src/common/natural_sort");
/* TESTS */
(0, node_test_1.test)('compareStrings: sorts numeric segments naturally', () => {
    const titles = ['Note 10', 'Note 2', 'Note 1'], sorted = titles.slice().sort(natural_sort_1.default.compareStrings);
    assert.deepEqual(sorted, ['Note 1', 'Note 2', 'Note 10']);
});
(0, node_test_1.test)('sortBy: sorts case-insensitively in ascending order', () => {
    const notes = [{ title: 'note 12' }, { title: 'Note 3' }, { title: 'note 1' }], sorted = natural_sort_1.default.sortBy(notes, note => note.title);
    assert.deepEqual(sorted.map(note => note.title), ['note 1', 'Note 3', 'note 12']);
});
(0, node_test_1.test)('sortBy: supports descending order', () => {
    const notes = [{ title: 'Chapter 2' }, { title: 'Chapter 11' }, { title: 'Chapter 1' }], sorted = natural_sort_1.default.sortBy(notes, note => note.title, 'descending');
    assert.deepEqual(sorted.map(note => note.title), ['Chapter 11', 'Chapter 2', 'Chapter 1']);
});
