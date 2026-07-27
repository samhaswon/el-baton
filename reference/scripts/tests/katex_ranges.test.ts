/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import KatexRanges from '../../src/common/katex_ranges';

/* TESTS */

test ( 'katex ranges: detects inline and display math delimiters', () => {

  const markdown = 'alpha $x+y$ beta\n$$x^2 + y^2$$\nomega';
  const ranges = KatexRanges.find ( markdown );

  assert.equal ( ranges.length, 2 );

  const [inlineRange, displayRange] = ranges;

  assert.equal ( markdown.slice ( inlineRange.start, inlineRange.end ), '$x+y$' );
  assert.equal ( markdown.slice ( displayRange.start, displayRange.end ), '$$x^2 + y^2$$' );

});

test ( 'katex ranges: ignores dollars inside inline code and regular fenced blocks', () => {

  const markdown = [
    'price is `$100` but math is $x$',
    '```js',
    'const price = "$5";',
    '```'
  ].join ( '\n' );

  const ranges = KatexRanges.find ( markdown );

  assert.equal ( ranges.length, 1 );
  assert.equal ( markdown.slice ( ranges[0].start, ranges[0].end ), '$x$' );

});

test ( 'katex ranges: excludes tex/latex/katex fenced blocks entirely', () => {

  const markdown = [
    'before',
    '```latex',
    '\\frac{a}{b}',
    '```',
    'after'
  ].join ( '\n' );

  const ranges = KatexRanges.find ( markdown );

  assert.equal ( ranges.length, 1 );
  assert.equal ( markdown.slice ( ranges[0].start, ranges[0].end ), '```latex\n\\frac{a}{b}\n```' );

});

