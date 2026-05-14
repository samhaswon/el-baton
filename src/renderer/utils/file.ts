
/* IMPORT */

import * as fs from 'fs';
import * as path from 'path';

/* STORAGE */

const Storage = { //TODO: This shouldn't be here

  /* VARIABLES */

  operations: 0, // Number of currently pending operations

  /* HELPERS */

  /**
   * Wraps a filesystem action so callers can tell whether storage work is still
   * pending.
   */
  _wrapAction ( action: Function ) {

    return async function wrappedAction ( ...args: any[] ) {
      Storage.operations++;
      const res = await action.apply ( undefined, args );
      Storage.operations--;
      return res;
    };

  },

  /* API */

  /**
   * Returns whether all tracked filesystem actions have settled.
   */
  isIdle () {

    return !Storage.operations;

  }

};

/* FILE */

const File = {

  /* VARIABLES */

  storage: Storage,

  /* HELPERS */

  /**
   * Creates a missing parent directory and retries write-like operations that
   * failed because their destination did not exist.
   */
  _handleError: async ( e: NodeJS.ErrnoException, filePath: string, method: Function, args: any[] ) => {

    if ( e.code === 'ENOENT' ) {

      await fs.promises.mkdir ( path.dirname ( filePath ), { recursive: true } );

      return method ( ...args );

    }

  },

  /* API */

  /**
   * Checks whether a file or directory exists.
   */
  exists: Storage._wrapAction ( async ( filePath: string ): Promise<boolean> => {

    try {

      await fs.promises.access ( filePath, fs.constants.F_OK );

      return true;

    } catch ( e ) {

      return false;

    }

  }),

  /**
   * Reads filesystem metadata, returning `undefined` when the path cannot be
   * statted.
   */
  stat: Storage._wrapAction ( async ( filePath: string ): Promise<fs.Stats | undefined> => {

    try {

      return await fs.promises.stat ( filePath );

    } catch ( e ) {}

  }),

  /**
   * Reads a text file, returning `undefined` when it cannot be read.
   */
  read: Storage._wrapAction ( async ( filePath: string, encoding: BufferEncoding = 'utf8' ): Promise<string | undefined> => {

    try {

      return ( await fs.promises.readFile ( filePath, {encoding} ) ).toString ();

    } catch ( e ) {}

  }),

  /**
   * Copies a file, creating the destination directory if necessary.
   */
  copy: Storage._wrapAction ( async ( srcPath: string, dstPath: string ) => {

    try {

      return await fs.promises.copyFile ( srcPath, dstPath );

    } catch ( e ) {

      return await File._handleError ( e as NodeJS.ErrnoException, dstPath, File.copy, [srcPath, dstPath] );

    }

  }),

  /**
   * Renames or moves a file, creating the destination directory if necessary.
   */
  rename: Storage._wrapAction ( async ( oldPath: string, newPath: string ) => {

    try {

      return await fs.promises.rename ( oldPath, newPath );

    } catch ( e ) {

      return await File._handleError ( e as NodeJS.ErrnoException, newPath, File.rename, [oldPath, newPath] );

    }

  }),

  /**
   * Writes a text file, creating the parent directory if necessary.
   */
  write: Storage._wrapAction ( async ( filePath: string, content: string ) => {

    try {

      return await fs.promises.writeFile ( filePath, content, {} );

    } catch ( e ) {

      return await File._handleError ( e as NodeJS.ErrnoException, filePath, File.write, [filePath, content] );

    }

  }),

  /**
   * Deletes a path when it exists and ignores missing-path failures.
   */
  unlink: Storage._wrapAction ( async ( filePath: string ) => {

    try {

      return await fs.promises.unlink ( filePath );

    } catch ( e ) {}

  })

};

/* EXPORT */

export default File;
