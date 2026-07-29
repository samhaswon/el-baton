/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import Filename from '../../src/common/filename';

/* TESTS */

test ( 'sanitize: replaces filesystem-reserved characters with readable spaces', () => {

  assert.equal ( Filename.sanitize ( 'Lecture: 01 / Intro? <draft>' ), 'Lecture  01   Intro   draft' );
  assert.equal ( Filename.sanitize ( 'a\\b|c*d"e' ), 'a b c d e' );

});

test ( 'sanitize: removes control characters and trailing dots or spaces', () => {

  assert.equal ( Filename.sanitize ( 'Bad\u0000Name\u001f.  ' ), 'Bad Name' );

});

test ( 'sanitize: avoids Windows reserved basenames', () => {

  assert.equal ( Filename.sanitize ( 'CON' ), 'CON_' );
  assert.equal ( Filename.sanitize ( 'aux.txt' ), 'aux.txt_' );
  assert.equal ( Filename.sanitize ( 'LPT9.md' ), 'LPT9.md_' );
  assert.equal ( Filename.sanitize ( 'CON', '_' ), 'CON_' );

});

test ( 'sanitize: prevents path separators and traversal-looking names from surviving', () => {

  assert.equal ( Filename.sanitize ( '../secret' ), '.. secret' );
  assert.equal ( Filename.sanitize ( '..\\secret' ), '.. secret' );
  assert.equal ( Filename.sanitize ( '..' ), '' );

});
