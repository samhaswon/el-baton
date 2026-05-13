
/* IMPORT */

import * as fs from 'fs';
import * as path from 'path';
import Filename from '../../common/filename';

/* PATH */

//TODO: Publish this as `get-allowed-path` or something

const Path = {

  _allowedPaths: {} as { [filePath: string]: number }, // Ensuring we don't return the same path mutliple times within some amount of time, in order to avoid race conditions //UGLY

  /**
   * Reserves a candidate path for a short window so concurrent callers do not
   * choose the same unused filename.
   */
  _checkAllowedPath ( filePath: string ): boolean {

    if ( !Path._allowedPaths[filePath] || ( Path._allowedPaths[filePath] + 5000 ) < Date.now () ) {

      Path._allowedPaths[filePath] = Date.now ();

      return true;

    }

    return false;

  },

  /**
   * Finds a sanitized filename that does not currently exist in `folderPath`,
   * adding a numeric suffix when needed.
   */
  async getAllowedPath ( folderPath: string, baseName: string ): Promise<{ folderPath: string, filePath: string, fileName: string }> {

    baseName = baseName.replace ( /\//g, '∕' ); // Preserving a dash-like character

    let {name, ext} = path.parse ( baseName );

    name = name.replace ( / \(\d+\)$/, '' ); // Removing already existent suffix
    name = Path.sanitize ( name ); // Removing weird characters

    for ( let i = 1;; i++ ) {

      const suffix = i > 1 ? ` (${i})` : '',
            fileName = `${name}${suffix}${ext}`,
            filePath = path.join ( folderPath, fileName );

      try {

        await fs.promises.access ( filePath );

      } catch ( e ) {

        if ( !Path._checkAllowedPath ( filePath ) ) continue;

        return { folderPath, filePath, fileName };

      }

    }

  },

  /**
   * Removes characters that are unsafe for filenames while keeping a readable
   * display-oriented name.
   */
  sanitize ( filePath: string ): string {

    return Filename.sanitize ( filePath, ' ' )
             .replace ( /#/g, ' ' )
             .trim ();

  }

};

/* EXPORT */

export default Path;
