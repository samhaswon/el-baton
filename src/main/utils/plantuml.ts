/* IMPORT */

import {app} from 'electron';
import {createHash} from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {spawn} from 'child_process';
import PlantUML, {PlantUMLRenderOptions, PlantUMLRenderResult} from '@common/plantuml';
import PlantUMLSQLiteCache from '@common/plantuml_sqlite_cache';

/* TYPES */

type PlantUMLCachedPayload = {
  status: 'ok' | 'error',
  origin: 'local' | 'remote',
  svg?: string,
  error?: string,
  externalUrl?: string
};

type PlantUMLEncoded = {
  encoded: string,
  externalUrl: string
};

/* PLANTUML */

const PlantUMLService = {

  /* VARIABLES */

  _cache: undefined as PlantUMLSQLiteCache | undefined,
  _jarPath: undefined as string | undefined,
  _encoder: undefined as undefined | { encode: ( source: string ) => string },

  /* HELPERS */

  _hashKey ( key: string ): string {

    return createHash ( 'sha1' ).update ( key ).digest ( 'hex' );

  },

  _getCache (): PlantUMLSQLiteCache {

    if ( this._cache ) return this._cache;

    const dbPath = path.join ( app.getPath ( 'userData' ), 'cache', 'plantuml_cache.sqlite3' );

    this._cache = new PlantUMLSQLiteCache ( dbPath );

    return this._cache;

  },

  _resolvePlantUmlJarPath (): string {

    if ( this._jarPath ) return this._jarPath;

    const executorPath = require.resolve ( 'node-plantuml/lib/plantuml-executor.js' ),
          packageJarPath = path.join ( path.dirname ( executorPath ), '..', 'vendor', 'plantuml.jar' ),
          runtimeDirPath = path.join ( app.getPath ( 'userData' ), 'runtime' ),
          runtimeJarPath = path.join ( runtimeDirPath, 'plantuml.jar' );

    fs.mkdirSync ( runtimeDirPath, { recursive: true } );

    if ( !fs.existsSync ( runtimeJarPath ) ) {
      fs.copyFileSync ( packageJarPath, runtimeJarPath );
    }

    this._jarPath = runtimeJarPath;

    return runtimeJarPath;

  },

  _getEncoder (): { encode: ( source: string ) => string } {

    if ( this._encoder ) return this._encoder;

    this._encoder = require ( 'plantuml-encoder' ) as { encode: ( source: string ) => string };

    return this._encoder!;

  },

  _buildRemoteEndpoint ( source: string, serverUrl: string ): PlantUMLEncoded {

    const encoded = this._getEncoder ().encode ( source ),
          externalUrl = PlantUML.buildRemoteSvgUrl ( serverUrl, encoded );

    return { encoded, externalUrl };

  },

  async _renderLocal ( source: string, timeoutMs: number ): Promise<PlantUMLCachedPayload> {

    if ( !source.trim () ) {
      return {
        status: 'error',
        origin: 'local',
        error: 'Empty PlantUML source'
      };
    }

    const jarPath = this._resolvePlantUmlJarPath ();

    return new Promise<PlantUMLCachedPayload> ( resolve => {

      const args = [
        '-Djava.awt.headless=true',
        '-jar',
        jarPath,
        '-pipe',
        '-tsvg'
      ];

      const child = spawn ( 'java', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      } );

      const stdoutChunks: Buffer[] = [],
            stderrChunks: Buffer[] = [];

      let settled = false;

      const settle = ( payload: PlantUMLCachedPayload ) => {

        if ( settled ) return;

        settled = true;

        clearTimeout ( timeoutId );

        resolve ( payload );

      };

      const timeoutId = setTimeout ( () => {

        if ( !child.killed ) child.kill ( 'SIGKILL' );

        settle ({
          status: 'error',
          origin: 'local',
          error: `Local renderer timed out after ${timeoutMs}ms`
        });

      }, timeoutMs );

      child.stdout.on ( 'data', chunk => {
        stdoutChunks.push ( Buffer.isBuffer ( chunk ) ? chunk : Buffer.from ( chunk ) );
      });

      child.stderr.on ( 'data', chunk => {
        stderrChunks.push ( Buffer.isBuffer ( chunk ) ? chunk : Buffer.from ( chunk ) );
      });

      child.once ( 'error', error => {
        settle ({
          status: 'error',
          origin: 'local',
          error: error.message || 'Failed to launch local PlantUML renderer'
        });
      });

      child.once ( 'close', code => {

        const stdout = Buffer.concat ( stdoutChunks ).toString ( 'utf8' ).trim (),
              stderr = Buffer.concat ( stderrChunks ).toString ( 'utf8' ).trim ();

        if ( stdout && /<svg[\s>]/i.test ( stdout ) ) {
          settle ({
            status: 'ok',
            origin: 'local',
            svg: stdout
          });
          return;
        }

        const messages = [
          stderr,
          stdout,
          code && code !== 0 ? `PlantUML exited with code ${code}` : ''
        ].filter ( Boolean );

        const errorMessage = PlantUML.normalizeLocalError ( messages[0] || 'Local PlantUML renderer did not return SVG output' );

        settle ({
          status: 'error',
          origin: 'local',
          error: errorMessage
        });

      });

      child.stdin.write ( source );
      child.stdin.end ();

    } );

  },

  async _renderRemote ( source: string, serverUrl: string, timeoutMs: number ): Promise<PlantUMLCachedPayload> {

    const endpoint = this._buildRemoteEndpoint ( source, serverUrl ),
          controller = new AbortController (),
          timeoutId = setTimeout ( () => controller.abort (), timeoutMs );

    try {

      const response = await fetch ( endpoint.externalUrl, {
        signal: controller.signal,
        headers: {
          accept: 'image/svg+xml,text/plain;q=0.9,*/*;q=0.1'
        }
      } ),
            content = await response.text ();

      if ( !response.ok ) {
        return {
          status: 'error',
          origin: 'remote',
          error: `Remote renderer failed with HTTP ${response.status}: ${response.statusText}`,
          externalUrl: endpoint.externalUrl
        };
      }

      if ( !/<svg[\s>]/i.test ( content ) ) {
        const trimmed = content.trim ();

        return {
          status: 'error',
          origin: 'remote',
          error: trimmed || 'Remote PlantUML renderer did not return SVG output',
          externalUrl: endpoint.externalUrl
        };
      }

      return {
        status: 'ok',
        origin: 'remote',
        svg: content,
        externalUrl: endpoint.externalUrl
      };

    } catch ( error ) {

      const message = error instanceof Error ? error.message : String ( error );

      return {
        status: 'error',
        origin: 'remote',
        error: message,
        externalUrl: endpoint.externalUrl
      };

    } finally {

      clearTimeout ( timeoutId );

    }

  },

  /* API */

  async render ( source: string, options: PlantUMLRenderOptions = {} ): Promise<PlantUMLRenderResult> {

    const timeoutMs = PlantUML.clampTimeoutMs ( options.requestTimeoutMs ),
          cacheMaxEntries = PlantUML.clampCacheEntries ( options.cacheMaxEntries ),
          cacheMaxBytes = PlantUML.clampCacheBytes ( options.cacheMaxBytes ),
          externalServerUrl = PlantUML.normalizeServerUrl ( options.externalServerUrl ),
          normalizedSource = PlantUML.normalizeSource ( source ),
          forceRefresh = !!options.forceRefresh,
          cache = this._getCache ();

    await cache.updateOptions ({
      maxEntries: cacheMaxEntries,
      maxBytes: cacheMaxBytes
    });

    const localKey = this._hashKey ( `local\u0000${normalizedSource}` );

    let local = !forceRefresh ? await cache.get<PlantUMLCachedPayload> ( localKey ) : undefined;

    if ( !local ) {
      local = await this._renderLocal ( normalizedSource, timeoutMs );
      await cache.set ( localKey, local );
    }

    let selected: PlantUMLCachedPayload = local,
        remote: PlantUMLCachedPayload | undefined;

    if ( externalServerUrl ) {

      const remoteKey = this._hashKey ( `remote\u0000${externalServerUrl}\u0000${normalizedSource}` );

      remote = !forceRefresh ? await cache.get<PlantUMLCachedPayload> ( remoteKey ) : undefined;

      if ( !remote ) {
        remote = await this._renderRemote ( normalizedSource, externalServerUrl, timeoutMs );
        await cache.set ( remoteKey, remote );
      }

      if ( remote.status === 'ok' ) {
        selected = remote;
      } else if ( local.status !== 'ok' ) {
        selected = remote;
      }

    }

    return {
      status: selected.status,
      origin: selected.origin,
      svg: selected.svg,
      error: selected.error,
      externalUrl: selected.externalUrl,
      localStatus: local.status,
      localError: local.error,
      remoteStatus: remote?.status,
      remoteError: remote?.error
    };

  },

  async testExternalServer ( rawServerUrl: string, options: { requestTimeoutMs?: number } = {} ): Promise<PlantUMLRenderResult> {

    const serverUrl = PlantUML.normalizeServerUrl ( rawServerUrl ),
          timeoutMs = PlantUML.clampTimeoutMs ( options.requestTimeoutMs );

    if ( !serverUrl ) {
      return {
        status: 'error',
        origin: 'remote',
        error: 'External server URL is empty or invalid.',
        remoteStatus: 'error',
        remoteError: 'External server URL is empty or invalid.'
      };
    }

    const source = '@startuml\nBob -> Alice : hello\n@enduml',
          result = await this._renderRemote ( source, serverUrl, timeoutMs );

    return {
      status: result.status,
      origin: 'remote',
      svg: result.svg,
      error: result.error,
      externalUrl: result.externalUrl,
      remoteStatus: result.status,
      remoteError: result.error
    };

  },

  close () {

    this._cache?.close ();

    this._cache = undefined;

  }

};

/* EXPORT */

export default PlantUMLService;
