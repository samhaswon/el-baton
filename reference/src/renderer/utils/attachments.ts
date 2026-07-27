
/* IMPORT */

import * as _ from 'lodash';

/* ATTACHMENTS */

const Attachments = {

  /**
   * Sorts attachment filenames case-insensitively for stable display.
   */
  sort ( attachments: string[] ): string[] {

    return _.sortBy ( attachments, attachment => attachment.toLowerCase () );

  }

};

/* EXPORT */

export default Attachments;
