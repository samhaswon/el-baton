/* IMPORT */

import {decode} from 'html-entities';
import PlantUML from './plantuml';

/* MARKDOWN RENDER HELPERS */

const MarkdownRenderHelpers = {

  macroPlaceholders: {
    toc: 'MDMACROTOCPLACEHOLDER',
    pagebreak: 'MDMACROPAGEBREAKPLACEHOLDER'
  },
  escapedDollarPlaceholder: 'MDESCAPEDDOLLARPLACEHOLDER',

  replaceMacroPlaceholders ( markdown: string ): string {

    return markdown.replace ( /\[\[@(toc|pagebreak)\]\]/gi, ( match, name ) => {
      const macro = String ( name ).toLowerCase ();

      if ( macro === 'toc' ) return MarkdownRenderHelpers.macroPlaceholders.toc;
      if ( macro === 'pagebreak' ) return MarkdownRenderHelpers.macroPlaceholders.pagebreak;

      return match;
    });

  },

  replaceEscapedDollars ( value: string ): string {

    return value.replace ( /\\\$/g, MarkdownRenderHelpers.escapedDollarPlaceholder );

  },

  restoreEscapedDollars ( value: string ): string {

    return value.replace ( new RegExp ( MarkdownRenderHelpers.escapedDollarPlaceholder, 'g' ), '$' );

  },

  escapeHtml ( text: string ): string {

    return text
      .replace ( /&/g, '&amp;' )
      .replace ( /</g, '&lt;' )
      .replace ( />/g, '&gt;' )
      .replace ( /"/g, '&quot;' )
      .replace ( /'/g, '&#39;' );

  },

  stripHtml ( html: string ): string {

    return decode (
      html
      .replace ( /<[^>]*>/g, '' )
      .replace ( /\s+/g, ' ' )
      .trim ()
    );

  },

  isEscapedAt ( value: string, index: number ): boolean {

    let slashCount = 0;

    for ( let i = index - 1; i >= 0 && value[i] === '\\'; i-- ) {
      slashCount++;
    }

    return ( slashCount % 2 ) === 1;

  },

  findMathClosing ( value: string, start: number, displayMode: boolean ): number {

    for ( let i = start; i < value.length; i++ ) {
      if ( !displayMode && value[i] === '\n' ) break;
      if ( value[i] !== '$' ) continue;
      if ( MarkdownRenderHelpers.isEscapedAt ( value, i ) ) continue;

      if ( displayMode ) {
        if ( value[i + 1] !== '$' ) continue;
        return i;
      }

      // Inline math must stay on the same line.
      if ( value[i - 1] === '$' || value[i + 1] === '$' ) continue;
      return i;
    }

    return -1;

  },

  replaceMathDelimiters ( value: string, replace: ( texRaw: string, displayMode: boolean ) => string ): string {

    let output = '';

    for ( let i = 0; i < value.length; ) {
      if ( value[i] !== '$' || MarkdownRenderHelpers.isEscapedAt ( value, i ) ) {
        output += value[i];
        i += 1;
        continue;
      }

      const displayMode = value[i + 1] === '$',
            delimiterLength = displayMode ? 2 : 1,
            openEnd = i + delimiterLength,
            closeStart = MarkdownRenderHelpers.findMathClosing ( value, openEnd, displayMode );

      if ( closeStart === -1 ) {
        output += value[i];
        i += 1;
        continue;
      }

      const texRaw = value.slice ( openEnd, closeStart );

      // Keep empty math blocks as literal text.
      if ( !texRaw.length ) {
        output += value.slice ( i, closeStart + delimiterLength );
        i = closeStart + delimiterLength;
        continue;
      }

      output += replace ( texRaw, displayMode );
      i = closeStart + delimiterLength;
    }

    return output;

  },

  slugifyHeading ( text: string, counts: Record<string, number> ): string {

    const base = text
      .toLowerCase ()
      .replace ( /[^a-z0-9\s-]/g, ' ' )
      .replace ( /\s+/g, '-' )
      .replace ( /-+/g, '-' )
      .replace ( /^-+|-+$/g, '' ) || 'section';

    counts[base] = ( counts[base] || 0 ) + 1;

    return counts[base] === 1 ? base : `${base}-${counts[base]}`;

  },

  renderMacroTOC ( headings: Array<{ id: string, level: number, text: string }> ): string {

    if ( !headings.length ) return '';

    let html = '<div class="macro-toc"><p class="macro-toc-title">Table of Contents</p>',
        openLevels: number[] = [];

    for ( let index = 0, l = headings.length; index < l; index++ ) {

      const heading = headings[index];

      if ( !openLevels.length ) {

        html += '<ul class="macro-toc-list">';
        openLevels.push ( heading.level );

      } else if ( heading.level > openLevels[openLevels.length - 1] ) {

        html += '<ul class="macro-toc-list">';
        openLevels.push ( heading.level );

      } else {

        while ( openLevels.length && heading.level < openLevels[openLevels.length - 1] ) {
          html += '</li></ul>';
          openLevels.pop ();
        }

        if ( openLevels.length ) {
          html += '</li>';
        } else {
          html += '<ul class="macro-toc-list">';
          openLevels.push ( heading.level );
        }

      }

      html += `<li><a class="toc-item" href="#${heading.id}">${MarkdownRenderHelpers.escapeHtml ( heading.text )}</a>`;

    }

    if ( openLevels.length ) html += '</li>';

    while ( openLevels.length ) {
      html += '</ul>';
      openLevels.pop ();
    }

    return `${html}</div>`;

  },

  renderMacros ( html: string ): string {

    const headings: Array<{ id: string, level: number, text: string }> = [],
          slugCounts: Record<string, number> = {};

    const withAnchors = html.replace ( /<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, ( match, levelRaw, attrs = '', innerHtml ) => {
      const level = Number ( levelRaw ),
            text = MarkdownRenderHelpers.stripHtml ( innerHtml );

      if ( !text ) return match;

      const existingId = String ( attrs ).match ( /\sid="([^"]+)"/i )?.[1],
            id = existingId || MarkdownRenderHelpers.slugifyHeading ( text, slugCounts );

      headings.push ({ id, level, text });

      if ( existingId ) return match;

      return `<h${level}${attrs} id="${id}">${innerHtml}</h${level}>`;
    });

    const tocHtml = MarkdownRenderHelpers.renderMacroTOC ( headings );

    return withAnchors
      .replace ( /<p>MDMACROTOCPLACEHOLDER<\/p>/g, tocHtml )
      .replace ( /<p>MDMACROPAGEBREAKPLACEHOLDER<\/p>/g, '<hr class="pagebreak">' );

  },

  renderKatexPlaceholders (
    html: string,
    placeholders: Array<{ tex: string; displayMode: boolean }>,
    renderFn: ( tex: string, displayMode: boolean ) => string
  ): string {

    return html.replace ( /(?:MDKATEXPLACEHOLDER(\d+)END)|(?:@@_?_?MD_KATEX_(\d+)_?_?@@)/g, ( match, $1, $2 ) => {
      const index = Number ( $1 || $2 ),
            payload = placeholders[index];

      if ( !payload ) return match;

      return renderFn ( payload.tex, payload.displayMode );
    });

  },

  renderMermaidBlock ( source: string, cachedSvg?: string ): string {

    const payload = encodeURIComponent ( source );

    if ( cachedSvg ) {
      return `<div class="mermaid"><code class="mermaid-source hidden">${payload}</code>${cachedSvg}</div>`;
    }

    return `<div class="mermaid"><code class="mermaid-source hidden">${payload}</code></div>`;

  },

  renderMermaidError ( message: string ): string {

    return `<p class="mermaid-error text-warning">[mermaid error: ${MarkdownRenderHelpers.escapeHtml ( message )}]</p>`;

  },

  injectMermaidOpenExternal ( html: string ): string {

    return html.replace ( /<div class="mermaid">/g, '<div class="mermaid"><div class="mermaid-open-external" title="Open in Separate Window"><i class="icon small">open_in_new</i></div>' );

  },

  renderPlantUMLBlock ( source: string, cachedSvg?: string ): string {

    const payload = encodeURIComponent ( source );

    if ( cachedSvg ) {
      return `<div class="plantuml"><code class="plantuml-source hidden">${payload}</code>${cachedSvg}</div>`;
    }

    return `<div class="plantuml"><code class="plantuml-source hidden">${payload}</code></div>`;

  },

  renderPlantUMLError ( message: string, origin: 'local' | 'remote' = 'local' ): string {

    const escapedMessage = MarkdownRenderHelpers.escapeHtml ( message ),
          helpUrl = PlantUML.getErrorHelpUrl ( message, origin ),
          helpLink = helpUrl ? ` <a href="${helpUrl}" target="_blank" rel="noopener noreferrer">Graphviz download</a>` : '';

    return `<p class="plantuml-error text-warning">[plantuml ${origin} error: ${escapedMessage}]${helpLink}</p>`;

  },

  injectPlantUMLOpenExternal ( html: string ): string {

    return html.replace ( /<div class="plantuml">/g, '<div class="plantuml"><div class="plantuml-open-external hidden" title="Open External Diagram"><i class="icon small">open_in_new</i></div>' );

  },

  sanitizeUnsafeHtml ( html: string, enabled: boolean = true ): string {

    if ( !enabled ) return html;

    const decodeUrlValue = ( value: string ): string => {
      let output = value.trim ();

      for ( let i = 0; i < 3; i++ ) {
        const decodedEntities = decode ( output );

        if ( decodedEntities === output ) break;
        output = decodedEntities;
      }

      for ( let i = 0; i < 3; i++ ) {
        if ( !/%[0-9A-Fa-f]{2}/.test ( output ) ) break;

        try {
          const decodedPercent = decodeURIComponent ( output );

          if ( decodedPercent === output ) break;
          output = decodedPercent;
        } catch {
          break;
        }
      }

      return output;
    };

    return html
      .replace ( /<(script|style|title|textarea|xmp|noembed|noframes|plaintext)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '' )
      .replace ( /<(script|style|title|textarea|xmp|noembed|noframes|plaintext)\b[^>]*\/?>/gi, '' )
      .replace ( /<\/(script|style|title|textarea|xmp|noembed|noframes|plaintext)\s*>/gi, '' )
      .replace ( /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '' )
      .replace ( /\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '' )
      .replace ( /\s+(href|src|xlink:href|action|formaction|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, ( match, name, doubleQuoted, singleQuoted, bareValue ) => {
        const rawValue = String ( doubleQuoted ?? singleQuoted ?? bareValue ?? '' ),
              value = decodeUrlValue ( rawValue ),
              normalized = value.replace ( /[\u0000-\u001F\u007F\s]+/g, '' ).toLowerCase (),
              isUnsafeProtocol = (
                normalized.startsWith ( 'javascript:' ) ||
                normalized.startsWith ( 'vbscript:' ) ||
                ( normalized.startsWith ( 'data:' ) && !/^data:image\/(?:png|gif|jpeg|webp);/i.test ( normalized ) )
              );

        if ( isUnsafeProtocol ) return '';

        return match;
      });

  },

  shouldMemoizeKatex ( tex: string, minLength: number = 0 ): boolean {

    return tex.trim ().length >= Math.max ( 0, minLength );

  }

};

/* EXPORT */

export default MarkdownRenderHelpers;
