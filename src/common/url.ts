/* URL */

const ABSOLUTE_URL_RE = /^[a-z][a-z\d+\-.]*:/i,
      PROTOCOL_RELATIVE_URL_RE = /^\/\//;

const Url = {

  /**
   * Returns whether a URL has an explicit scheme such as `https:`, `mailto:`,
   * `file:`, or another RFC 3986-style protocol.
   */
  isAbsolute ( value: string ): boolean {

    return ABSOLUTE_URL_RE.test ( value.trim () );

  },

  /**
   * Returns whether a link should be treated as already absolute by markdown
   * link post-processing. Protocol-relative URLs are included so they are not
   * rewritten into malformed `https:////...` links.
   */
  isAbsoluteOrProtocolRelative ( value: string ): boolean {

    const trimmed = value.trim ();

    return ABSOLUTE_URL_RE.test ( trimmed ) || PROTOCOL_RELATIVE_URL_RE.test ( trimmed );

  }

};

/* EXPORT */

export default Url;
