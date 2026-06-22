/* IMPORT */

import Markdown from './markdown';

const cmark = require ( 'cmark-gfm' );

/* LEGACY TEST PIPELINE */

/**
 * Test-only baseline for native migration parity. Production code must import
 * `markdown.ts`, which always uses the project-owned native addon.
 */
const MarkdownLegacy = {

  renderPreview ( source: string, sourceFilePath?: string ): string {

    const preprocessed = Markdown.preprocessForCmark ( source, sourceFilePath ),
          html = cmark.renderHtmlSync ( preprocessed, Markdown._cmarkOptions );

    return Markdown.postprocessFromCmark ( html, sourceFilePath );

  }

};

/* EXPORT */

export default MarkdownLegacy;
