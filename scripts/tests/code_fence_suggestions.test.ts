/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import CodeFenceSuggestions from '../../src/common/code_fence_suggestions';

/* TESTS */

test ( 'code fence suggestions: detects fenced language query context', () => {

  const context = CodeFenceSuggestions.getContext ( '```py' );

  assert.ok ( context );
  assert.equal ( context?.marker, '```' );
  assert.equal ( context?.query, 'py' );
  assert.equal ( context?.queryStart, 3 );

});

test ( 'code fence suggestions: supports indented tilde fences', () => {

  const context = CodeFenceSuggestions.getContext ( '  ~~~mer' );

  assert.ok ( context );
  assert.equal ( context?.marker, '  ~~~' );
  assert.equal ( context?.query, 'mer' );
  assert.equal ( context?.queryStart, 5 );

});

test ( 'code fence suggestions: ignores non-fence content', () => {

  assert.equal ( CodeFenceSuggestions.getContext ( 'text ```py' ), null );
  assert.equal ( CodeFenceSuggestions.getContext ( '``' ), null );

});

test ( 'code fence suggestions: prioritizes startsWith matches and deduplicates', () => {

  const suggestions = CodeFenceSuggestions.getSuggestions ( 'py', ['python', 'cpython', 'py', 'python', 'typescript'], 10 );

  assert.deepEqual ( suggestions, ['python', 'py', 'cpython'] );

});

