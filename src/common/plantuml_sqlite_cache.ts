/* IMPORT */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

/* TYPES */

type CacheOptions = {
  maxEntries: number,
  maxBytes: number
};

type SQLiteRow = {
  payload: Buffer,
  updated_at: number,
  last_accessed_at: number,
  size_bytes: number
};

type SQLiteStatsRow = {
  count: number,
  total: number
};

type SQLiteDatabase = {
  exec: ( sql: string, callback: ( error: Error | null ) => void ) => void,
  run: ( sql: string, params: any[], callback: ( error: Error | null ) => void ) => void,
  get: ( sql: string, params: any[], callback: ( error: Error | null, row?: any ) => void ) => void,
  close: ( callback: ( error: Error | null ) => void ) => void
};

type SQLiteModule = {
  Database: new ( filePath: string, callback: ( error: Error | null ) => void ) => SQLiteDatabase
};

/* SQLITE CACHE */

const sqlite3 = require ( 'sqlite3' ) as SQLiteModule;

class PlantUMLSQLiteCache {

  /* VARIABLES */

  dbPath: string;
  options: CacheOptions;
  db?: SQLiteDatabase;
  queue: Promise<void>;

  /* CONSTRUCTOR */

  constructor ( dbPath: string, options: Partial<CacheOptions> = {} ) {

    this.dbPath = dbPath;
    this.options = {
      maxEntries: Math.max ( 20, Math.min ( 5000, Math.round ( Number ( options.maxEntries ) || 400 ) ) ),
      maxBytes: Math.max ( 1 * 1024 * 1024, Math.min ( 512 * 1024 * 1024, Math.round ( Number ( options.maxBytes ) || ( 64 * 1024 * 1024 ) ) ) )
    };
    this.queue = Promise.resolve ();

  }

  /* PRIVATE */

  _enqueue<T> ( fn: () => Promise<T> ): Promise<T> {

    const next = this.queue.then ( fn, fn );

    this.queue = next.then ( () => undefined, () => undefined );

    return next;

  }

  async _withRecovery<T> ( fn: () => Promise<T> ): Promise<T> {

    try {
      return await fn ();
    } catch ( error ) {
      this._resetDatabase ();
      return fn ();
    }

  }

  _resetDatabase () {

    const db = this.db;

    this.db = undefined;

    if ( !db ) return;

    try {
      db.close ( () => undefined );
    } catch ( error ) {
      // NOOP
    }

  }

  _openDatabase ( dbPath: string ): Promise<SQLiteDatabase> {

    return new Promise<SQLiteDatabase> ( ( resolve, reject ) => {

      const db = new sqlite3.Database ( dbPath, ( error: Error | null ) => {

        if ( error ) {
          reject ( error );
          return;
        }

        resolve ( db );

      } );

    } );

  }

  _exec ( sql: string ): Promise<void> {

    return new Promise<void> ( ( resolve, reject ) => {

      if ( !this.db ) {
        resolve ();
        return;
      }

      this.db.exec ( sql, ( error: Error | null ) => {
        if ( error ) reject ( error );
        else resolve ();
      } );

    } );

  }

  _run ( sql: string, params: any[] = [] ): Promise<void> {

    return new Promise<void> ( ( resolve, reject ) => {

      if ( !this.db ) {
        resolve ();
        return;
      }

      this.db.run ( sql, params, ( error: Error | null ) => {
        if ( error ) reject ( error );
        else resolve ();
      } );

    } );

  }

  _get<T> ( sql: string, params: any[] = [] ): Promise<T | undefined> {

    return new Promise<T | undefined> ( ( resolve, reject ) => {

      if ( !this.db ) {
        resolve ( undefined );
        return;
      }

      this.db.get ( sql, params, ( error: Error | null, row?: T ) => {
        if ( error ) reject ( error );
        else resolve ( row );
      } );

    } );

  }

  async _ensureDatabase () {

    const dbPath = this.dbPath;

    fs.mkdirSync ( path.dirname ( dbPath ), { recursive: true } );

    if ( this.db && !fs.existsSync ( dbPath ) ) {
      this._resetDatabase ();
    }

    if ( this.db ) return;

    this.db = await this._openDatabase ( dbPath );

    await this._exec ( 'PRAGMA journal_mode = WAL;' );
    await this._exec ( 'PRAGMA synchronous = NORMAL;' );
    await this._exec ( 'PRAGMA temp_store = MEMORY;' );
    await this._exec ( 'PRAGMA foreign_keys = ON;' );

    await this._exec (
      `CREATE TABLE IF NOT EXISTS plantuml_cache (
        cache_key TEXT PRIMARY KEY,
        payload BLOB NOT NULL,
        size_bytes INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL
      );`
    );

    await this._exec ( 'CREATE INDEX IF NOT EXISTS idx_plantuml_cache_last_accessed_at ON plantuml_cache(last_accessed_at);' );

  }

  _encode ( value: unknown ): Buffer {

    const content = Buffer.from ( JSON.stringify ( value ) );

    return zlib.brotliCompressSync ( content, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5
      }
    } );

  }

  _decode<T> ( payload: Buffer ): T {

    const inflated = zlib.brotliDecompressSync ( payload ),
          parsed = JSON.parse ( inflated.toString ( 'utf8' ) ) as T;

    return parsed;

  }

  async _prune () {

    while ( true ) {

      const stats = await this._get<SQLiteStatsRow> ( 'SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS total FROM plantuml_cache' ),
            count = stats?.count || 0,
            total = stats?.total || 0;

      if ( count <= this.options.maxEntries && total <= this.options.maxBytes ) break;

      const overflow = Math.max ( count - this.options.maxEntries, 1 ),
            deleteCount = Math.max ( 1, Math.min ( 50, overflow ) );

      await this._run ( 'DELETE FROM plantuml_cache WHERE cache_key IN (SELECT cache_key FROM plantuml_cache ORDER BY last_accessed_at ASC LIMIT ?)', [deleteCount] );

    }

  }

  /* API */

  updateOptions ( options: Partial<CacheOptions> = {} ): Promise<void> {

    if ( options.maxEntries !== undefined ) {
      this.options.maxEntries = Math.max ( 20, Math.min ( 5000, Math.round ( Number ( options.maxEntries ) || this.options.maxEntries ) ) );
    }

    if ( options.maxBytes !== undefined ) {
      this.options.maxBytes = Math.max ( 1 * 1024 * 1024, Math.min ( 512 * 1024 * 1024, Math.round ( Number ( options.maxBytes ) || this.options.maxBytes ) ) );
    }

    return this._enqueue ( () => this._withRecovery ( async () => {
      await this._ensureDatabase ();
      await this._prune ();
    } ) );

  }

  get<T> ( key: string ): Promise<T | undefined> {

    return this._enqueue ( () => this._withRecovery ( async () => {

      await this._ensureDatabase ();

      const now = Date.now (),
            row = await this._get<SQLiteRow> ( 'SELECT payload, updated_at, last_accessed_at, size_bytes FROM plantuml_cache WHERE cache_key = ?', [key] );

      if ( !row ) return;

      await this._run ( 'UPDATE plantuml_cache SET last_accessed_at = ? WHERE cache_key = ?', [now, key] );

      try {
        const payload = Buffer.isBuffer ( row.payload ) ? row.payload : Buffer.from ( row.payload );
        return this._decode<T> ( payload );
      } catch ( error ) {
        // Corrupted rows should not block rendering.
        await this._run ( 'DELETE FROM plantuml_cache WHERE cache_key = ?', [key] );
        return;
      }

    } ) );

  }

  set<T> ( key: string, value: T ): Promise<void> {

    return this._enqueue ( () => this._withRecovery ( async () => {

      await this._ensureDatabase ();

      const now = Date.now (),
            payload = this._encode ( value );

      await this._run (
        'INSERT OR REPLACE INTO plantuml_cache (cache_key, payload, size_bytes, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?)',
        [key, payload, payload.length, now, now]
      );

      await this._prune ();

    } ) );

  }

  close () {

    this._resetDatabase ();

  }

}

/* EXPORT */

export type {CacheOptions};
export default PlantUMLSQLiteCache;
