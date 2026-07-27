/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import {isShallowEqual} from '../../src/renderer/lib/shallow_equal';

/* TESTS */

test ( 'isShallowEqual: returns true for objects with the same own enumerable keys and strict values', () => {

  assert.equal ( isShallowEqual ({
    a: 1,
    b: 'text',
    c: true
  }, {
    a: 1,
    b: 'text',
    c: true
  }), true );

});

test ( 'isShallowEqual: compares nested objects by reference', () => {

  const nested = { value: 1 };

  assert.equal ( isShallowEqual ({
    nested
  }, {
    nested
  }), true );

  assert.equal ( isShallowEqual ({
    nested: { value: 1 }
  }, {
    nested: { value: 1 }
  }), false );

});

test ( 'isShallowEqual: returns false when keys or values differ', () => {

  assert.equal ( isShallowEqual ({
    a: 1,
    b: 2
  }, {
    a: 1,
    b: 3
  }), false );

  assert.equal ( isShallowEqual ({
    a: 1
  }, {
    a: 1,
    b: 2
  }), false );

});
