/* FILENAME */

const CONTROL_AND_RESERVED_RE = /[\u0000-\u001f\u0080-\u009f<>:"/\\|?*]/g,
      TRAILING_DOTS_OR_SPACES_RE = /[. ]+$/g,
      RESERVED_BASENAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

const Filename = {

  /**
   * Replaces characters that are unsafe on common filesystems while keeping the
   * resulting name readable for users.
   */
  sanitize ( value: string, replacement: string = ' ' ): string {

    const sanitized = value
      .replace ( CONTROL_AND_RESERVED_RE, replacement )
      .replace ( TRAILING_DOTS_OR_SPACES_RE, '' )
      .trim ();

    if ( !sanitized ) return '';
    if ( RESERVED_BASENAME_RE.test ( sanitized ) ) return `${sanitized}${replacement.trim () || '_'}`;

    return sanitized;

  }

};

/* EXPORT */

export default Filename;
