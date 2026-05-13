
/* IMPORT */

import * as _ from 'lodash';
import matter from 'gray-matter';
import * as yaml from 'js-yaml';

/* GUTTER */

const Gutter = { // Add/remove an empty line at the start/end

  /**
   * Adds the blank-line padding expected around front-matter bodies.
   */
  add ( str: string ): string {

    return `\n${str}\n`;

  },

  /**
   * Removes the front-matter body padding added before serialization.
   */
  remove ( str: string ): string {

    return str.replace ( /^\n/, '' ).replace ( /\n$/, '' );

  }

};

/* PARSER */

const Parser = {

  options: {
    flowLevel: 1,
    indent: 2,
    lineWidth: 1000000
  },

  /**
   * Parses YAML front matter, returning an empty object for invalid metadata.
   */
  parse ( str: string ) {

    try {

      const load = ( yaml as any ).load || ( yaml as any ).safeLoad;

      return load ? load ( str, Parser.options ) : {};

    } catch ( e ) {

      return {};

    }

  },

  /**
   * Serializes metadata using the same YAML options used by gray-matter.
   */
  stringify ( obj: object ): string {

    const dump = ( yaml as any ).dump || ( yaml as any ).safeDump;

    return dump ? dump ( obj, Parser.options ) : '';

  }

};

/* METADATA */

const Metadata = {

  parser: Parser,

  options: {
    engines: {
      yaml: Parser
    }
  },

  /**
   * Extracts the front-matter metadata object from note content.
   */
  get ( content: string ): object {

    return matter ( content, Metadata.options ).data;

  },

  /**
   * Replaces note front matter with the provided metadata and preserves the note
   * body.
   */
  set ( content: string, metadata: object ): string {

    content = Gutter.add ( matter ( content, Metadata.options ).content );

    if ( !_.isEmpty ( metadata ) ) {

      content = matter.stringify ( content, metadata, Metadata.options );

    }

    return content;

  },

  /**
   * Removes front matter and returns only the note body.
   */
  remove ( content: string ): string {

    return Gutter.remove ( matter ( content, Metadata.options ).content );

  }

};

/* EXPORT */

export default Metadata;
