
/* IMPORT */

import * as os from 'os';

/* UTILS */

type BatchableMethod<Args extends unknown[] = unknown[]> = ( ...args: Args ) => unknown;

type BatchLike = {
  add: <Args extends unknown[]> ( method: BatchableMethod<Args>, args?: Args ) => void;
};

const Utils = {

  pathSepRe: /(?:\/|\\)+/g,

  /**
   * Wraps a method so calls are queued into a batch object.
   */
  batchify<Args extends unknown[]> ( batch: BatchLike, fn: BatchableMethod<Args> ) {

    return function ( ...args: Args ) {
      batch.add ( fn, args );
    };

  },

  /**
   * Encodes a filesystem path for file URLs after normalizing separators.
   */
  encodeFilePath ( filePath: string ): string {

    return encodeURI ( filePath.replace ( Utils.pathSepRe, '/' ) );

  },

  /**
   * Returns the first non-empty line in a string.
   */
  getFirstUnemptyLine ( str: string ): string | null {

    const match = str.match ( /^.*?\S.*$/m );

    return match && match[0];

  },

  /**
   * Normalizes path separators for the current platform.
   */
  normalizeFilePaths ( filePaths: string[] ): string[] {

    if ( os.platform () !== 'win32' ) return filePaths;

    return filePaths.map ( filePath => filePath.replace ( Utils.pathSepRe, '\\' ) );

  },

  /**
   * Resolves once matching elements appear in the DOM, or `undefined` after a
   * bounded number of animation frames.
   */
  qsaWait ( selector: string, context?: HTMLElement ): Promise<Cash | undefined> { // Return the found elements as soon as they appear in the DOM

    let iteration = 0;

    return new Promise<Cash | undefined> ( resolve => {

      const loop = () => {

        if ( iteration++ >= 2500 ) return resolve ( undefined ); // Something unexpected probably happened, stop checking

        const $ele = $(selector, context);

        if ( !$ele.length ) return requestAnimationFrame ( loop );

        resolve ( $ele );

      };

      loop ();

    });

  }

};

/* EXPORT */

export default Utils;
