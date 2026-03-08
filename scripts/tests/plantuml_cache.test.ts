/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import PlantUMLSQLiteCache from '../../src/common/plantuml_sqlite_cache';

/* HELPERS */

const withTempDir = async ( callback: ( dirPath: string ) => Promise<void> ) => {

  const dirPath = fs.mkdtempSync ( path.join ( os.tmpdir (), 'el-baton-plantuml-cache-' ) );

  try {
    await callback ( dirPath );
  } finally {
    fs.rmSync ( dirPath, { recursive: true, force: true } );
  }

};

/* TESTS */

test ( 'plantuml sqlite cache: stores and restores compressed payloads', async () => {

  await withTempDir ( async dirPath => {

    const dbPath = path.join ( dirPath, 'plantuml.sqlite3' ),
          cache = new PlantUMLSQLiteCache ( dbPath, { maxEntries: 20, maxBytes: 8 * 1024 * 1024 } ),
          value = {
            status: 'ok',
            origin: 'local',
            svg: '<svg><text>Hello</text></svg>'
          } as const;

    await cache.set ( 'key-a', value );

    assert.deepEqual ( await cache.get ( 'key-a' ), value );

    cache.close ();

  } );

} );

test ( 'plantuml sqlite cache: prunes least-recent entries when maxEntries is exceeded', async () => {

  await withTempDir ( async dirPath => {

    const dbPath = path.join ( dirPath, 'plantuml.sqlite3' ),
          cache = new PlantUMLSQLiteCache ( dbPath, { maxEntries: 20, maxBytes: 8 * 1024 * 1024 } );

    for ( let index = 0; index < 20; index++ ) {
      await cache.set ( `k${index}`, { status: 'ok', origin: 'local', svg: `<svg>${index}</svg>` } );
    }

    // Bump k0 so k1 becomes oldest.
    assert.ok ( await cache.get ( 'k0' ) );

    await cache.set ( 'k20', { status: 'ok', origin: 'local', svg: '<svg>20</svg>' } );

    assert.ok ( await cache.get ( 'k0' ) );
    assert.equal ( await cache.get ( 'k1' ), undefined );
    assert.ok ( await cache.get ( 'k20' ) );

    cache.close ();

  } );

} );

test ( 'plantuml sqlite cache: prunes when maxBytes is exceeded', async () => {

  await withTempDir ( async dirPath => {

    const dbPath = path.join ( dirPath, 'plantuml.sqlite3' ),
          cache = new PlantUMLSQLiteCache ( dbPath, { maxEntries: 20, maxBytes: 1 * 1024 * 1024 } ),
          randomA = crypto.randomBytes ( 900000 ).toString ( 'base64' ),
          randomB = crypto.randomBytes ( 900000 ).toString ( 'base64' );

    await cache.set ( 'a', { status: 'ok', origin: 'local', svg: `<svg>${randomA}</svg>` } );
    await cache.set ( 'b', { status: 'ok', origin: 'local', svg: `<svg>${randomB}</svg>` } );

    const hasA = !!( await cache.get ( 'a' ) ),
          hasB = !!( await cache.get ( 'b' ) );

    assert.equal ( hasA && hasB, false );
    assert.equal ( hasA || hasB, true );

    cache.close ();

  } );

} );

test ( 'plantuml sqlite cache: recovers if database file disappears from disk', async () => {

  await withTempDir ( async dirPath => {

    const dbPath = path.join ( dirPath, 'plantuml.sqlite3' ),
          cache = new PlantUMLSQLiteCache ( dbPath, { maxEntries: 20, maxBytes: 8 * 1024 * 1024 } );

    await cache.set ( 'before', { status: 'ok', origin: 'local', svg: '<svg>before</svg>' } );

    assert.ok ( await cache.get ( 'before' ) );

    fs.rmSync ( dbPath, { force: true } );
    fs.rmSync ( `${dbPath}-wal`, { force: true } );
    fs.rmSync ( `${dbPath}-shm`, { force: true } );

    await cache.set ( 'after', { status: 'ok', origin: 'remote', svg: '<svg>after</svg>' } );

    assert.equal ( await cache.get ( 'before' ), undefined );
    assert.deepEqual ( await cache.get ( 'after' ), { status: 'ok', origin: 'remote', svg: '<svg>after</svg>' } );

    cache.close ();

  } );

} );
