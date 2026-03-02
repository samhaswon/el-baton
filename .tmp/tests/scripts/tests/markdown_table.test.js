"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = require("node:assert/strict");
const markdown_table_1 = require("../../src/common/markdown_table");
/* TESTS */
(0, node_test_1.test)('markdown tables: formats content cells and default delimiters to a shared width', () => {
    const input = 'name|value\n-|-\nlong|7', output = markdown_table_1.default.formatBlock(input);
    assert.equal(output, '| name | value |\n| ---- | ----- |\n| long | 7     |');
});
(0, node_test_1.test)('markdown tables: preserves left, right, and centered column styling', () => {
    const input = '| a | b | c |\n| :- | -: | :-: |\n| long | 1 | zz |', output = markdown_table_1.default.formatBlock(input);
    assert.equal(output, '| a    |   b |  c  |\n| :--- | --: | :-: |\n| long |   1 | zz  |');
});
(0, node_test_1.test)('markdown tables: keeps centered delimiters padded as source cells', () => {
    const input = '| x |\n|:-:|\n| yy |', output = markdown_table_1.default.formatBlock(input);
    assert.equal(output, '|  x  |\n| :-: |\n| yy  |');
});
(0, node_test_1.test)('markdown tables: finds the full table block for body rows and ignores fenced code', () => {
    const lines = [
        '| a | b |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        '```md',
        '| nope | still code |',
        '| --- | --- |',
        '```'
    ], bodyBlock = markdown_table_1.default.getBlockAtLine(lines, 3), fencedBlock = markdown_table_1.default.getBlockAtLine(lines, 6);
    assert.deepEqual(bodyBlock, {
        startLineNumber: 1,
        endLineNumber: 3
    });
    assert.equal(fencedBlock, undefined);
});
