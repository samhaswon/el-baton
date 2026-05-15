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
  payload: unknown
};

type SQLiteStatsRow = {
  count: number | bigint,
  total: number | bigint
};

type SQLiteStatement = {
  run: ( ...params: any[] ) => unknown,
  get: ( ...params: any[] ) => any
};

type SQLiteDatabase = {
  exec: ( sql: string ) => unknown,
  prepare: ( sql: string ) => SQLiteStatement,
  close: () => void
};

type SQLiteModule = {
  DatabaseSync: new ( location: string, options?: { timeout?: number } ) => SQLiteDatabase
};

/* SQLITE CACHE */

const {DatabaseSync} = require ( 'node:sqlite' ) as SQLiteModule;

class PlantUMLSQLiteCache {

  /* VARIABLES */

  dbPath: string;
  options: CacheOptions;
  db?: SQLiteDatabase;
  queue: Promise<void>;

  /* CONSTRUCTOR */

  /**
   * Creates a PlantUML cache backed by the provided SQLite database path.
   */
  constructor ( dbPath: string, options: Partial<CacheOptions> = {} ) {

    this.dbPath = dbPath;
    this.options = {
      maxEntries: Math.max ( 20, Math.min ( 5000, Math.round ( Number ( options.maxEntries ) || 400 ) ) ),
      maxBytes: Math.max ( 1 * 1024 * 1024, Math.min ( 512 * 1024 * 1024, Math.round ( Number ( options.maxBytes ) || ( 64 * 1024 * 1024 ) ) ) )
    };
    this.queue = Promise.resolve ();

  }

  /* PRIVATE */

  /**
   * Serializes cache operations so the synchronous SQLite database is accessed
   * in a predictable order.
   */
  _enqueue<T> ( fn: () => Promise<T> ): Promise<T> {

    const next = this.queue.then ( fn, fn );

    this.queue = next.then ( () => undefined, () => undefined );

    return next;

  }

  /**
   * Retries an operation once after resetting the database connection.
   */
  async _withRecovery<T> ( fn: () => Promise<T> ): Promise<T> {

    try {
      return await fn ();
    } catch ( error ) {
      this._resetDatabase ();
      return fn ();
    }

  }

  /**
   * Closes and clears the active database connection.
   */
  _resetDatabase () {

    const db = this.db;

    this.db = undefined;

    if ( !db ) return;

    try {
      db.close ();
    } catch ( error ) {
      // NOOP
    }

  }

  /**
   * Opens the SQLite database with the cache's timeout policy.
   */
  _openDatabase ( dbPath: string ): SQLiteDatabase {

    return new DatabaseSync ( dbPath, { timeout: 5000 } );

  }

  /**
   * Executes a SQL statement when the database is open.
   */
  _exec ( sql: string ): void {

    if ( !this.db ) return;

    this.db.exec ( sql );

  }

  /**
   * Runs a prepared SQL statement with positional parameters.
   */
  _run ( sql: string, params: any[] = [] ): void {

    if ( !this.db ) return;

    this.db.prepare ( sql ).run ( ...params );

  }

  /**
   * Reads one row from a prepared SQL statement.
   */
  _get<T> ( sql: string, params: any[] = [] ): T | undefined {

    if ( !this.db ) return;

    return this.db.prepare ( sql ).get ( ...params ) as T | undefined;

  }

  /**
   * Converts SQLite integer values into JavaScript numbers.
   */
  _normalizeInteger ( value: number | bigint | undefined ): number {

    if ( typeof value === 'bigint' ) return Number ( value );
    if ( typeof value === 'number' ) return value;

    return 0;

  }

  /**
   * Opens and initializes the cache database and schema when needed.
   */
  async _ensureDatabase () {

    const dbPath = this.dbPath;

    fs.mkdirSync ( path.dirname ( dbPath ), { recursive: true } );

    if ( this.db && !fs.existsSync ( dbPath ) ) {
      this._resetDatabase ();
    }

    if ( this.db ) return;

    this.db = this._openDatabase ( dbPath );

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

  /**
   * Encodes a cached value as compressed JSON.
   */
  _encode ( value: unknown ): Buffer {

    const content = Buffer.from ( JSON.stringify ( value ) );

    return zlib.brotliCompressSync ( content, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5
      }
    } );

  }

  /**
   * Decodes a compressed JSON cache payload.
   */
  _decode<T> ( payload: Buffer ): T {

    const inflated = zlib.brotliDecompressSync ( payload ),
          parsed = JSON.parse ( inflated.toString ( 'utf8' ) ) as T;

    return parsed;

  }

  /**
   * Removes least-recently-accessed rows until configured cache limits are met.
   */
  async _prune () {

    while ( true ) {

      const stats = await this._get<SQLiteStatsRow> ( 'SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS total FROM plantuml_cache' ),
            count = this._normalizeInteger ( stats?.count ),
            total = this._normalizeInteger ( stats?.total );

      if ( count <= this.options.maxEntries && total <= this.options.maxBytes ) break;

      const overflow = Math.max ( count - this.options.maxEntries, 1 ),
            deleteCount = Math.max ( 1, Math.min ( 50, overflow ) );

      await this._run ( 'DELETE FROM plantuml_cache WHERE cache_key IN (SELECT cache_key FROM plantuml_cache ORDER BY last_accessed_at ASC LIMIT ?)', [deleteCount] );

    }

  }

  /* API */

  /**
   * Updates cache size limits and prunes existing rows if necessary.
   */
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

  /**
   * Reads a cached value and updates its last-accessed timestamp.
   */
  get<T> ( key: string ): Promise<T | undefined> {

    return this._enqueue ( () => this._withRecovery ( async () => {

      await this._ensureDatabase ();

      const now = Date.now (),
            row = await this._get<SQLiteRow> ( 'SELECT payload, updated_at, last_accessed_at, size_bytes FROM plantuml_cache WHERE cache_key = ?', [key] );

      if ( !row ) return;

      await this._run ( 'UPDATE plantuml_cache SET last_accessed_at = ? WHERE cache_key = ?', [now, key] );

      try {
        const payload = Buffer.isBuffer ( row.payload )
          ? row.payload
          : ( row.payload instanceof Uint8Array ? Buffer.from ( row.payload ) : Buffer.from ( row.payload as any ) );
        return this._decode<T> ( payload );
      } catch ( error ) {
        // Corrupted rows should not block rendering.
        await this._run ( 'DELETE FROM plantuml_cache WHERE cache_key = ?', [key] );
        return;
      }

    } ) );

  }

  /**
   * Stores a value in the cache and prunes old rows when limits are exceeded.
   */
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

  /**
   * Closes the active database connection.
   */
  close () {

    this._resetDatabase ();

  }

}

/* EXPORT */

export type {CacheOptions};
export default PlantUMLSQLiteCache;
