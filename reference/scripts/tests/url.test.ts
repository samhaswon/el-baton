/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import Url from '../../src/common/url';

/* TESTS */

test ( 'isAbsolute: accepts URLs with explicit schemes', () => {

  assert.equal ( Url.isAbsolute ( 'https://example.com' ), true );
  assert.equal ( Url.isAbsolute ( 'mailto:hello@example.com' ), true );
  assert.equal ( Url.isAbsolute ( 'file:///tmp/note.md' ), true );
  assert.equal ( Url.isAbsolute ( 'custom+scheme-v1.2:value' ), true );

});

test ( 'isAbsolute: rejects relative, root-relative, protocol-relative, and fragment links', () => {

  assert.equal ( Url.isAbsolute ( 'example.com' ), false );
  assert.equal ( Url.isAbsolute ( './note.md' ), false );
  assert.equal ( Url.isAbsolute ( '/note.md' ), false );
  assert.equal ( Url.isAbsolute ( '//example.com/path' ), false );
  assert.equal ( Url.isAbsolute ( '#heading' ), false );

});

test ( 'isAbsoluteOrProtocolRelative: includes protocol-relative network links', () => {

  assert.equal ( Url.isAbsoluteOrProtocolRelative ( 'https://example.com' ), true );
  assert.equal ( Url.isAbsoluteOrProtocolRelative ( '//example.com/path' ), true );
  assert.equal ( Url.isAbsoluteOrProtocolRelative ( 'example.com/path' ), false );
  assert.equal ( Url.isAbsoluteOrProtocolRelative ( '/local/path' ), false );

});
