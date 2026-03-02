/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import MarkdownTable from '../../src/common/markdown_table';

/* TESTS */

test ( 'markdown tables: formats content cells and default delimiters to a shared width', () => {

  const input = 'name|value\n-|-\nlong|7',
        output = MarkdownTable.formatBlock ( input );

  assert.equal (
    output,
    '| name | value |\n| ---- | ----- |\n| long | 7     |'
  );

});

test ( 'markdown tables: preserves left, right, and centered column styling', () => {

  const input = '| a | b | c |\n| :- | -: | :-: |\n| long | 1 | zz |',
        output = MarkdownTable.formatBlock ( input );

  assert.equal (
    output,
    '| a    |   b |  c  |\n| :--- | --: | :-: |\n| long |   1 | zz  |'
  );

});

test ( 'markdown tables: keeps centered delimiters padded as source cells', () => {

  const input = '| x |\n|:-:|\n| yy |',
        output = MarkdownTable.formatBlock ( input );

  assert.equal (
    output,
    '|  x  |\n| :-: |\n| yy  |'
  );

});

test ( 'markdown tables: finds the full table block for body rows and ignores fenced code', () => {

  const lines = [
          '| a | b |',
          '| --- | --- |',
          '| 1 | 2 |',
          '',
          '```md',
          '| nope | still code |',
          '| --- | --- |',
          '```'
        ],
        bodyBlock = MarkdownTable.getBlockAtLine ( lines, 3 ),
        fencedBlock = MarkdownTable.getBlockAtLine ( lines, 6 );

  assert.deepEqual ( bodyBlock, {
    startLineNumber: 1,
    endLineNumber: 3
  });

  assert.equal ( fencedBlock, undefined );

});
