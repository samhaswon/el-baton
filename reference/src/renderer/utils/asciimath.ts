
/* IMPORT */

import * as _ from 'lodash';
import asciimath2tex from 'asciimath2tex';

/* ASCIIMATH */

const AsciiMath = {

  /**
   * Returns the memoized AsciiMath parser instance.
   */
  getParser: _.memoize ( () => {

    return new asciimath2tex ();

  }),

  /**
   * Converts AsciiMath input to TeX.
   */
  toTeX ( str: string ): string {

    const Parser = AsciiMath.getParser ();

    return Parser.parse ( str );

  }

};

/* EXPORT */

export default AsciiMath;
