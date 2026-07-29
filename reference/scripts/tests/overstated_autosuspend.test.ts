/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import {Container, autosuspend} from '../../src/renderer/lib/overstated';

/* TESTS */

test ( 'autosuspend: excluded methods remain synchronous', () => {

  class Example extends Container<{ count: number }> {

    autosuspend = {
      methodsExclude: /^sort$/
    };

    state = {
      count: 0
    };

    sort = ( values: number[] ): number[] => {

      return values.slice ().sort ( ( a, b ) => a - b );

    }

    increment = () => {

      return this.setState ({ count: this.state.count + 1 });

    }

  }

  const store = autosuspend ( new Example () ) as Example,
        sorted = store.sort ([3, 1, 2]),
        incremented = store.increment ();

  assert.deepEqual ( sorted, [1, 2, 3] );
  assert.equal ( typeof ( incremented as Promise<void> ).then, 'function' );

} );
