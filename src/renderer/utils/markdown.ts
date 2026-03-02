
/* IMPORT */

import * as _ from 'lodash';
import {AllHtmlEntities as entities} from 'html-entities';
import * as isAbsoluteUrl from 'is-absolute-url';
import * as path from 'path';
import Emoji from '@common/emoji';
import MarkdownPath from '@common/markdown_path';
import MarkdownRenderHelpers from '@common/markdown_render_helpers';
import AsciiMath from './asciimath';
import Highlighter from './highlighter';
import MermaidCache from './mermaid_cache';
import Utils from './utils';
const cmark = require ( 'cmark-gfm' );

const {encodeFilePath} = Utils;

type MarkdownRuntimeConfig = {
  cwd?: string;
  notesPath?: string;
  attachmentsPath?: string;
  notesToken: string;
  attachmentsToken: string;
  tagsToken: string;
  notesExt: string;
  notesRe: RegExp;
  notesReSource?: string;
  notesReFlags?: string;
  disableScriptSanitization: boolean;
  katex: {
    throwOnError: boolean;
    strict: 'ignore' | 'warn' | 'error';
    displayMode: boolean;
    errorColor: string;
  };
};

type MarkdownTransformRule = {
  type: 'language' | 'output';
  regex: RegExp | string;
  replace: any;
};

/* MARKDOWN */

const Markdown = {

  re: /_.*?_|\*.*?\*|~.*?~|`.*?`|<.*?>|:\w+?:|^\s*>|^\s*#|\[.*?\]|--|==|```|~~~|^\s*\d+\.|^\s*[*+-]\s|\n\s*\n/m,
  wrapperRe: /^<p>(.*?)<\/p>$/,
  _katex: undefined as undefined | typeof import ( 'katex' ),
  _mathPlaceholders: [] as { tex: string, displayMode: boolean }[],
  _katexCache: new Map<string, string> (),
  _katexCacheMax: 3000,
  _katexCacheMinTexLength: 8,
  _renderAbortName: 'MarkdownRenderAborted',
  _runtimeConfig: {
    cwd: undefined,
    notesPath: undefined,
    attachmentsPath: undefined,
    notesToken: '@note',
    attachmentsToken: '@attachment',
    tagsToken: '@tag',
    notesExt: '.md',
    notesRe: /\.(?:md|mkd|mdwn|mdown|markdown|markdn|mdtxt|mdtext|txt)$/,
    disableScriptSanitization: false,
    katex: {
      throwOnError: false,
      strict: 'ignore',
      displayMode: false,
      errorColor: '#F44336'
    }
  } as MarkdownRuntimeConfig,
  _cmarkOptions: {
    unsafe: true,
    extensions: {
      autolink: true,
      strikethrough: true,
      table: true,
      tasklist: true
    }
  } as any,

  initKatex: _.once ( () => {
    Markdown._katex = require ( 'katex' );
    require ( 'katex/dist/contrib/mhchem.min.js' );
  }),

  renderKatex ( tex: string, displayMode: boolean ): string {

    const shouldMemoize = MarkdownRenderHelpers.shouldMemoizeKatex ( tex, Markdown._katexCacheMinTexLength ),
          cacheKey = `${displayMode ? '1' : '0'}::${tex}`,
          cached = shouldMemoize ? Markdown._katexCache.get ( cacheKey ) : undefined;

    if ( _.isString ( cached ) ) {
      // LRU bump
      Markdown._katexCache.delete ( cacheKey );
      Markdown._katexCache.set ( cacheKey, cached );
      return cached;
    }

    Markdown.initKatex ();
    const rendered = Markdown._katex!.renderToString ( tex, { //TSC
      ...Markdown._runtimeConfig.katex,
      displayMode
    });

    if ( !shouldMemoize ) return rendered;

    Markdown._katexCache.set ( cacheKey, rendered );

    if ( Markdown._katexCache.size > Markdown._katexCacheMax ) {
      const oldestKey = Markdown._katexCache.keys ().next ().value;
      if ( oldestKey ) Markdown._katexCache.delete ( oldestKey );
    }

    return rendered;
  },

  normalizeTex ( tex: string ): string {

    // In KaTeX math mode a bare `~` is not reliably accepted; map it to a thin space.
    return tex.replace ( /(^|[^\\])~/g, '$1\\,' );

  },

  setRuntimeConfig ( config: Partial<MarkdownRuntimeConfig> = {} ) {

    const nextConfig = {
      ...Markdown._runtimeConfig,
      ...config,
      katex: {
        ...Markdown._runtimeConfig.katex,
        ...( config.katex || {} )
      }
    };

    Markdown._runtimeConfig = nextConfig;

    if ( config.notesReSource ) {
      try {
        Markdown._runtimeConfig.notesRe = new RegExp ( config.notesReSource, config.notesReFlags || '' );
      } catch ( error ) {
        console.error ( '[markdown] Invalid notes regex runtime config', error );
      }
    }

  },

  resolveMarkdownRelativePath ( rawTarget: string, sourceFilePath?: string ): string | undefined {

    const {cwd, notesPath} = Markdown._runtimeConfig;

    if ( !cwd || !notesPath ) return;

    return MarkdownPath.resolveMarkdownRelativePath ( rawTarget, { cwd, notesPath, sourceFilePath } );

  },

  toTokenRelativePath ( parentPath: string, childPath: string ): string {

    return MarkdownPath.toTokenRelativePath ( parentPath, childPath );

  },

  resolveTokenPath ( basePath: string, tokenPath: string ): string | undefined {

    return MarkdownPath.resolveTokenPath ( basePath, tokenPath );

  },

  applyTransforms ( input: string, rules: MarkdownTransformRule[], type: 'language' | 'output' ): string {

    let output = input;

    for ( let index = 0, l = rules.length; index < l; index++ ) {
      const rule = rules[index];
      if ( rule.type !== type ) continue;
      const regex = _.isString ( rule.regex ) ? new RegExp ( rule.regex, 'g' ) : rule.regex;
      output = output.replace ( regex, rule.replace );
    }

    return output;

  },

  __yield: () => new Promise<void> ( resolve => globalThis.setTimeout ( resolve, 0 ) ),

  __throwIfAborted ( shouldAbort?: () => boolean ) {

    if ( shouldAbort && shouldAbort () ) {
      const error = new Error ( 'Markdown render aborted' );
      ( error as any ).name = Markdown._renderAbortName;
      throw error;
    }

  },

  preprocessForCmark ( str: string, sourceFilePath?: string ): string {

    let output = Markdown.preprocessMath ( str );

    output = MarkdownRenderHelpers.replaceMacroPlaceholders ( output );
    output = Markdown.applyTransforms ( output, Markdown.extensions.emoji () as MarkdownTransformRule[], 'language' );

    // Language-stage transforms that are parser-dependent should run before cmark.
    output = Markdown.applyTransforms ( output, Markdown.extensions.resolveRelativeLinks ( sourceFilePath ) as MarkdownTransformRule[], 'language' );
    output = Markdown.applyTransforms ( output, Markdown.extensions.encodeSpecialLinks () as MarkdownTransformRule[], 'language' );
    output = Markdown.applyTransforms ( output, Markdown.extensions.wikilink () as MarkdownTransformRule[], 'language' );

    return output;

  },

  postprocessFromCmark ( html: string, sourceFilePath?: string ): string {

    // Preserve legacy extension ordering to reduce regressions.
    const outputExtensionsBeforeMacros = [
      ...Markdown.extensions.asciimath2tex (),
      ...Markdown.extensions.katex (),
      ...Markdown.extensions.mermaid (),
      ...Markdown.extensions.mermaidOpenExternal (),
      ...Markdown.extensions.highlight (),
      ...Markdown.extensions.copy (),
      ...Markdown.extensions.checkbox (),
      ...Markdown.extensions.targetBlankLinks (),
      ...Markdown.extensions.resolveRelativeLinks ( sourceFilePath )
    ];

    const outputExtensionsAfterMacros = [
      ...Markdown.extensions.attachment (),
      ...Markdown.extensions.note (),
      ...Markdown.extensions.tag (),
      ...Markdown.extensions.noProtocolLinks ()
    ];

    const withBaseTransforms = Markdown.applyTransforms ( html, outputExtensionsBeforeMacros as any, 'output' ),
          withMacros = MarkdownRenderHelpers.renderMacros ( withBaseTransforms ),
          withFinalTransforms = Markdown.applyTransforms ( withMacros, outputExtensionsAfterMacros as any, 'output' );

    return MarkdownRenderHelpers.sanitizeUnsafeHtml ( withFinalTransforms, !Markdown._runtimeConfig.disableScriptSanitization );

  },

  renderPreviewCmark ( str: string, sourceFilePath?: string ): string {

    const preprocessed = Markdown.preprocessForCmark ( str, sourceFilePath ),
          html = cmark.renderHtmlSync ( preprocessed, Markdown._cmarkOptions );

    return Markdown.postprocessFromCmark ( html, sourceFilePath );

  },

  renderPreviewCmarkAsync: async ( str: string, sourceFilePath?: string, shouldAbort?: () => boolean ): Promise<string> => {

    Markdown.__throwIfAborted ( shouldAbort );

    const preprocessed = Markdown.preprocessForCmark ( str, sourceFilePath );

    await Markdown.__yield ();
    Markdown.__throwIfAborted ( shouldAbort );

    const html = cmark.renderHtmlSync ( preprocessed, Markdown._cmarkOptions );

    await Markdown.__yield ();
    Markdown.__throwIfAborted ( shouldAbort );

    const outputExtensionsBeforeMacros = [
      ...Markdown.extensions.asciimath2tex (),
      ...Markdown.extensions.katex (),
      ...Markdown.extensions.mermaid (),
      ...Markdown.extensions.mermaidOpenExternal (),
      ...Markdown.extensions.highlight (),
      ...Markdown.extensions.copy (),
      ...Markdown.extensions.checkbox (),
      ...Markdown.extensions.targetBlankLinks (),
      ...Markdown.extensions.resolveRelativeLinks ( sourceFilePath )
    ];

    const outputExtensionsAfterMacros = [
      ...Markdown.extensions.attachment (),
      ...Markdown.extensions.note (),
      ...Markdown.extensions.tag (),
      ...Markdown.extensions.noProtocolLinks ()
    ];

    let output = html;

    for ( let index = 0, l = outputExtensionsBeforeMacros.length; index < l; index++ ) {
      const rule = outputExtensionsBeforeMacros[index];
      const regex = _.isString ( rule.regex ) ? new RegExp ( rule.regex, 'g' ) : rule.regex;
      output = output.replace ( regex, rule.replace );
      if ( ( index % 2 ) === 1 ) {
        await Markdown.__yield ();
        Markdown.__throwIfAborted ( shouldAbort );
      }
    }

    output = MarkdownRenderHelpers.renderMacros ( output );

    await Markdown.__yield ();
    Markdown.__throwIfAborted ( shouldAbort );

    for ( let index = 0, l = outputExtensionsAfterMacros.length; index < l; index++ ) {
      const rule = outputExtensionsAfterMacros[index];
      const regex = _.isString ( rule.regex ) ? new RegExp ( rule.regex, 'g' ) : rule.regex;
      output = output.replace ( regex, rule.replace );
      if ( ( index % 2 ) === 1 ) {
        await Markdown.__yield ();
        Markdown.__throwIfAborted ( shouldAbort );
      }
    }

    return MarkdownRenderHelpers.sanitizeUnsafeHtml ( output, !Markdown._runtimeConfig.disableScriptSanitization );

  },

  renderStripCmark ( str: string ): string {

    const transforms = Markdown.extensions.strip () as MarkdownTransformRule[],
          preprocessed = Markdown.applyTransforms ( str, transforms, 'language' ),
          html = cmark.renderHtmlSync ( preprocessed, Markdown._cmarkOptions );

    return Markdown.applyTransforms ( html, transforms, 'output' );

  },

  isRenderAbortError ( error: any ): boolean {

    return !!error && error.name === Markdown._renderAbortName;

  },

  preprocessMath ( str: string ): string {

    const codeChunks: string[] = [],
          stashCode = ( value: string ) => {
            const index = codeChunks.push ( value ) - 1;
            return `@@__MD_CODE_${index}__@@`;
          },
          stashMath = ( tex: string, displayMode: boolean ) => {
            const index = Markdown._mathPlaceholders.push ({ tex, displayMode }) - 1;
            return `MDKATEXPLACEHOLDER${index}END`;
          };

    Markdown._mathPlaceholders = [];

    // Stash fenced code blocks first so we don't render math inside them.
    // This parser intentionally supports indented/list fences (common in notes).
    const lines = str.split ( '\n' ),
          rebuiltLines: string[] = [];

    for ( let i = 0, l = lines.length; i < l; i++ ) {

      const line = lines[i],
            normalizedLine = line.replace ( /\r$/, '' ),
            open = normalizedLine.match ( /^([ \t]*)(`{3,}|~{3,})(.*)$/ );

      if ( !open ) {
        rebuiltLines.push ( line );
        continue;
      }

      const fenceSeq = open[2],
            fenceChar = fenceSeq[0],
            fenceLen = fenceSeq.length,
            blockLines = [line];

      let closed = false;

      for ( i = i + 1; i < l; i++ ) {
        const current = lines[i],
              normalizedCurrent = current.replace ( /\r$/, '' );
        blockLines.push ( current );
        if ( new RegExp ( `^[ \\t]*\\${fenceChar}{${fenceLen},}[ \\t]*$` ).test ( normalizedCurrent ) ) {
          closed = true;
          break;
        }
      }

      if ( !closed ) {
        // Unterminated fence: keep original content to avoid corrupting markdown.
        rebuiltLines.push ( ...blockLines );
        continue;
      }

      const normalizedBlockLines = [...blockLines];

      // Normalize fence delimiter indentation so tab/space-indented fences are still parsed reliably.
      normalizedBlockLines[0] = `${fenceSeq}${open[3] || ''}`.replace ( /\s+$/, '' );
      normalizedBlockLines[normalizedBlockLines.length - 1] = fenceSeq;

      rebuiltLines.push ( stashCode ( normalizedBlockLines.join ( '\n' ) ) );

    }

    str = rebuiltLines.join ( '\n' );

    // Stash inline code spans.
    str = str.replace ( /(^|[^\\])(`+)([^\r\n]*?[^`])\2(?!`)/g, ( match, $1, $2, $3 ) => `${$1}${stashCode ( `${$2}${$3}${$2}` )}` );

    // Preserve escaped currency dollars so the HTML-stage KaTeX pass can't mistake them for math delimiters.
    str = MarkdownRenderHelpers.replaceEscapedDollars ( str );

    // Stash math first so markdown parsing doesn't alter math content.
    // Escaped delimiters (e.g. `\$`) are not treated as open/close delimiters.
    str = MarkdownRenderHelpers.replaceMathDelimiters ( str, ( texRaw, displayMode ) => {
      const tex = Markdown.normalizeTex ( entities.decode ( texRaw )
        .replace ( /<br\s*\/?>/gi, '\n' )
        .replace ( /&nbsp;/gi, ' ' ) );

      return stashMath ( tex, displayMode );
    });

    // Notable-style superscripts/subscripts.
    str = str.replace ( /(^|[^\\^])\^([^\s^](?:[^^\n]*?[^\s^])?)\^/g, ( match, $1, $2 ) => `${$1}<sup>${$2}</sup>` );
    str = str.replace ( /(^|[^\\~])~(?!~)([^\s~](?:[^~\n]*?[^\s~])?)~(?!~)/g, ( match, $1, $2 ) => `${$1}<sub>${$2}</sub>` );

    // Restore code blocks/spans.
    str = str.replace ( /@@__MD_CODE_(\d+)__@@/g, ( match, $1 ) => codeChunks[Number ( $1 )] ?? match );

    return str;

  },

  extensions: {

    utilities: {

      anchorOutputRe: /<a[^>]*>(.*?)<\/a>/g,
      checkboxLanguageRe: /^(\s*[*+-][ \t]+\[(?:x|X| )?\])(?!\[|\()/gm,
      checkboxCheckmarkRe: /\[([^\]]*?)\]/g,
      checkboxCheckedRe: /\[(x|X)\]/g,
      codeLanguageRe: /(^|[^\\])(`+)([^\r]*?[^`])\2(?!`)/gm,
      codeOutputRe: /<code[^>]*?>([^]*?)<\/code>/g,

      isInside ( re: RegExp, str: string, index: number ) { // Checks if the index is inside the ranges matched by the regex in the string

        re.lastIndex = 0;

        let match;

        while ( match = re.exec ( str ) ) {

          if ( index < match.index ) return false;

          if ( index >= match.index && index < ( match.index + match[0].length ) ) return true;

        }

        return false;

      },

      isInsideAnchor ( str: string, index: number ) {

        return Markdown.extensions.utilities.isInside ( Markdown.extensions.utilities.anchorOutputRe, str, index );

      },

      isInsideCode ( str: string, index: number, language: boolean = false ) {

        const re = language ? Markdown.extensions.utilities.codeLanguageRe : Markdown.extensions.utilities.codeOutputRe;

        return Markdown.extensions.utilities.isInside ( re, str, index );

      },

      toggleCheckbox ( str: string, nth: number, force?: boolean ) {

        const {checkboxLanguageRe, checkboxCheckmarkRe, checkboxCheckedRe} = Markdown.extensions.utilities;

        checkboxLanguageRe.lastIndex = 0;

        let checkbox, nthCurrent = -1;

        while ( checkbox = checkboxLanguageRe.exec ( str ) ) {

          if ( Markdown.extensions.utilities.isInsideCode ( str, checkbox.index, true ) ) continue;

          nthCurrent++;

          if ( nthCurrent !== nth ) continue;

          force = _.isBoolean ( force ) ? force : !checkboxCheckedRe.test ( checkbox[0] );

          const checkboxNext = checkbox[0].replace ( checkboxCheckmarkRe, force ? '[x]' : '[ ]' );

          return `${str.slice ( 0, checkbox.index )}${checkboxNext}${str.slice ( checkbox.index + checkbox[0].length, Infinity )}`;

        }

        return str;

      }

    },

    strip () {

      return [
        { // Standalone syntax => Removing all of it
          type: 'language',
          regex: /--+|==+|```+|~~~+/gm,
          replace: () => ''
        },
        { // Emoji shortcodes => Keep the shortcode readable in plain text
          type: 'language',
          regex: /:(\S+?):/gm,
          replace: ( match, $1 ) => $1
        },
        { // Wrap syntax => Removing only the wrapping syntax
          type: 'language',
          regex: /_.*?_|\*.*?\*|~.*?~|`.*?`/gm,
          replace: match => match.slice ( 1, -1 )
        },
        { // Images => Removing all of it
          type: 'language',
          regex: /!\[[^\]]+?\]\([^)]+?\)/gm,
          replace: () => ''
        },
        { // Links => Removing the url
          type: 'language',
          regex: /\[([^\]]+?)\](?:\([^)]+?\)|\[[^)]+?\])/gm,
          replace: ( match, $1 ) => $1
        },
        { // Wikilinks => Preserving the title
          type: 'language',
          regex: /\[\[([^|\]]+?)(?:\|([^\]]+?))?\]\]/gm,
          replace: ( match, $1 ) => $1
        },
        { // Ending header syntax => Removing the special part
          type: 'language',
          regex: /^(\s*#+\s.*?)(#+\s*?$)/gm,
          replace: ( match, $1 ) => $1
        },
        { // Start syntax => Removing the special syntax
          type: 'language',
          regex: /^(\s*)(?:>(?:\s*?>)*|#+\s|\d+\.|[*+-](?=\s)(?:\s*\[[xX ]\]\s*)?|\[[^\]]+?\]:.*)/gm, //TODO: If multiple of these get chained together this regex will fail
          replace: ( match, $1 ) => $1
        },
        { // HTML => Removing all of it
          type: 'output',
          regex: /<[^>]*?>/g,
          replace: () => ''
        }
      ];

    },

    highlight () {

      return [{
        type: 'output',
        regex: /<pre><code(\s[^>]*language-[^>]*)>([^]+?)<\/code><\/pre>/g,
        replace ( match, $1, $2 ) {
          try {
            const language = Highlighter.inferLanguage ( $1 );
            const highlighted = Highlighter.highlight ( $2, language );
            return `<pre><code ${$1 || ''}>${highlighted}</code></pre>`;
          } catch ( e ) {
            console.error ( `[highlight] ${e.message}` );
            return match;
          }
        }
      }];

    },

    copy () {

      return [{
        type: 'output',
        regex: /<pre><code([^>]*)>([^]+?)<\/code><\/pre>/g,
        replace ( match ) {
          return `<div class="copy-wrapper"><div class="copy" title="Copy code to clipboard"><i class="icon small">content_copy</i></div>${match}</div>`;
        }
      }];

    },

    asciimath2tex () {

      return [
        { // AsciiMath 2 TeX
          type: 'output',
          regex: /(?:<pre><code\s[^>]*language-asciimath[^>]*>([^]+?)<\/code><\/pre>)|(?:(?:\\)?&&(?!<)(\S(?:.*?\S)?)(?:\\)?&&(?!\d))|(?:(?:\\)?&amp;(?!<)&amp;(?!<)(\S(?:.*?\S)?)(?:\\)?&amp;(?!<)&amp;(?!\d))/g,
          replace ( match, $1, $2, $3, index, content ) {
            if ( match.startsWith ( '\\' ) ) return match;
            if ( Markdown.extensions.utilities.isInsideCode ( content, index, false ) ) return match;
            if ( Markdown.extensions.utilities.isInsideAnchor ( content, index ) ) return match; // In order to better support encoded emails
            const asciimath = $1 || $2 || $3;
            try {
              let tex = AsciiMath.toTeX ( entities.decode ( asciimath ) );
              return `$$${tex}$$`;
            } catch ( e ) {
              console.error ( `[asciimath] ${e.message}` );
              return match;
            }
          }
        },
        { // Escaping cleanup
          type: 'output',
          regex: /\\&(?:amp;)?/g,
          replace ( match, index, content ) {
            if ( Markdown.extensions.utilities.isInsideCode ( content, index, false ) ) return match;
            if ( Markdown.extensions.utilities.isInsideAnchor ( content, index ) ) return match; // In order to better support encoded emails
            return match.slice ( 1 );
          }

        }
      ];

    },

    katex () {

      return [
        { // KaTeX rendering for placeholders generated during preprocessing
          type: 'output',
          regex: /(?:MDKATEXPLACEHOLDER(\d+)END)|(?:@@_?_?MD_KATEX_(\d+)_?_?@@)/g,
          replace ( match, $1, $2 ) {
            try {
              return MarkdownRenderHelpers.renderKatexPlaceholders ( match, Markdown._mathPlaceholders, ( tex, displayMode ) => Markdown.renderKatex ( tex, displayMode ) );
            } catch ( e ) {
              console.error ( `[katex] ${e.message}` );
              return match;
            }
          }
        },
        { // KaTeX rendering for fenced tex/latex/katex code blocks
          type: 'output',
          regex: /<pre><code\s[^>]*language-(?:tex|latex|katex)[^>]*>([^]+?)<\/code><\/pre>/g,
          replace ( match, $1, index, content ) {
            if ( Markdown.extensions.utilities.isInsideCode ( content, index, false ) ) return match;
            const tex = Markdown.normalizeTex ( entities.decode ( $1 )
              .replace ( /<br\s*\/?>/gi, '\n' )
              .replace ( /&nbsp;/gi, ' ' ) );
            try {
              return Markdown.renderKatex ( tex, true );
            } catch ( e ) {
              console.error ( `[katex] ${e.message}` );
              return match;
            }
          }
        },
        { // KaTeX rendering for inline/display delimiters in HTML output (eg AsciiMath transformed output)
          type: 'output',
          regex: /(^|[^\\])(?:(\$\$([\s\S]+?)\$\$)|(\$(?!\$)([^\n$]+?)\$(?!\$)))/gm,
          replace ( match, prefix, $displayMatch, $displayInner, $inlineMatch, $inlineInner, index, content ) {
            const mathIndex = index + prefix.length;

            if ( Markdown.extensions.utilities.isInsideCode ( content, mathIndex, false ) ) return match;
            if ( Markdown.extensions.utilities.isInsideAnchor ( content, mathIndex ) ) return match;
            const tex = Markdown.normalizeTex ( entities.decode ( $displayInner || $inlineInner )
              .replace ( /<br\s*\/?>/gi, '\n' )
              .replace ( /&nbsp;/gi, ' ' ) );
            try {
              return `${prefix}${Markdown.renderKatex ( tex, !!$displayMatch )}`;
            } catch ( e ) {
              console.error ( `[katex] ${e.message}` );
              return match;
            }
          }
        },
        { // Escaping cleanup
          type: 'output',
          regex: /\\\$/g,
          replace ( match, index, content ) {
            if ( Markdown.extensions.utilities.isInsideCode ( content, index, false ) ) return match;
            if ( Markdown.extensions.utilities.isInsideAnchor ( content, index ) ) return match; // In order to better support encoded emails
            return match.slice ( 1 );
          }
        },
        {
          type: 'output',
          regex: new RegExp ( MarkdownRenderHelpers.escapedDollarPlaceholder, 'g' ),
          replace () {
            return '$';
          }
        }
      ];

    },

    mermaid () {

      return [{
        type: 'output',
        regex: /<pre><code\s[^>]*language-mermaid[^>]*>([^]+?)<\/code><\/pre>/g,
        replace ( match, $1 ) {
          const source = entities.decode ( $1 ),
                cachedSvg = MermaidCache.get ( source );
          return MarkdownRenderHelpers.renderMermaidBlock ( source, cachedSvg );
        }
      }];

    },

    mermaidOpenExternal () {

      return [{
        type: 'output',
        regex: /<div class="mermaid">/g,
        replace ( match ) {
          return MarkdownRenderHelpers.injectMermaidOpenExternal ( match );
        }
      }];

    },

    checkbox () {

      let nth = 0;

      return [
        { // Resetting the counter
          type: 'language',
          regex: /^/g,
          replace () {
            nth = 0;
            return '';
          }
        },
        { // Adding metadata
          type: 'output',
          regex: /<input type="checkbox"(?: disabled)?([^>]*)>/gm,
          replace ( match, $1 ) {
            return `<input type="checkbox"${$1} data-nth="${nth++}">`
          }
        }
      ];

    },

    emoji () {

      return [{
        type: 'language',
        regex: /:([a-z0-9_+\-]+):/gi,
        replace ( match, $1, index, content ) {
          if ( Markdown.extensions.utilities.isInsideCode ( content, index, true ) ) return match;
          return Emoji.get ( $1 ) || match;
        }
      }];

    },

    targetBlankLinks () {

      return [{
        type: 'output',
        regex: /<a(.*?)href="(.*?)>/g,
        replace ( match, $1, $2 ) {
          if ( $2.startsWith ( '#' ) ) { // URL fragment
            return match;
          } else {
            return `<a${$1}target="_blank" href="${$2}>`;
          }
        }
      }];

    },

    resolveRelativeLinks ( sourceFilePath?: string ) {

      const {
        attachmentsPath,
        attachmentsToken,
        notesPath,
        notesToken
      } = Markdown._runtimeConfig;

      if ( !attachmentsPath || !notesPath ) return [];

      return [
        { // Markdown
          type: 'language',
          regex: /\[([^\]]*)\]\(([^)\s]+)\)/g,
          replace ( match, $1, $2, index, content ) {
            if ( Markdown.extensions.utilities.isInsideCode ( content, index, true ) ) return match;
            const filePath = Markdown.resolveMarkdownRelativePath ( $2, sourceFilePath );
            if ( !filePath ) return match;
            if ( MarkdownPath.isPathInside ( attachmentsPath, filePath ) ) {
              return `[${$1}](${attachmentsToken}/${Markdown.toTokenRelativePath ( attachmentsPath, filePath )})`;
            } else if ( MarkdownPath.isPathInside ( notesPath, filePath ) ) {
              return `[${$1}](${notesToken}/${Markdown.toTokenRelativePath ( notesPath, filePath )})`;
            } else {
              return match;
            }
          }
        },
        { // <a>, <img>, <source>
          type: 'output',
          regex: /<(a|img|source)\s(.*?)(src|href)="([^"]*)"(.*?)>/gm,
          replace ( match, $1, $2, $3, $4, $5 ) {
            const filePath = Markdown.resolveMarkdownRelativePath ( $4, sourceFilePath );
            if ( !filePath ) return match;
            if ( MarkdownPath.isPathInside ( attachmentsPath, filePath ) ) {
              return `<${$1} ${$2} ${$3}="${attachmentsToken}/${Markdown.toTokenRelativePath ( attachmentsPath, filePath )}" ${$5}>`;
            } else if ( MarkdownPath.isPathInside ( notesPath, filePath ) ) {
              return `<${$1} ${$2} ${$3}="${notesToken}/${Markdown.toTokenRelativePath ( notesPath, filePath )}"${$5}>`;
            } else {
              return match;
            }
          }
        }
      ];

    },

    encodeSpecialLinks () { // Or they won't be parsed as images/links whatever

      return [{
        type: 'language',
        regex: `\\[([^\\]]*)\\]\\(((?:${Markdown._runtimeConfig.attachmentsToken}|${Markdown._runtimeConfig.notesToken}|${Markdown._runtimeConfig.tagsToken})/[^\\)]*)\\)`,
        replace ( match, $1, $2, index, content ) {
          if ( Markdown.extensions.utilities.isInsideCode ( content, index, true ) ) return match;
          return `[${$1}](${encodeFilePath ( $2 )})`;
        }
      }];

    },

    attachment () {

      const {attachmentsPath, attachmentsToken: token} = Markdown._runtimeConfig;

      if ( !attachmentsPath ) return [];

      return [
        { // <img>, <source>
          type: 'output',
          regex: `<(img|source)(.*?)src="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3, $4 ) {
            $3 = decodeURI ( $3 );
            const filePath = Markdown.resolveTokenPath ( attachmentsPath, $3 );
            if ( !filePath ) return match;
            return `<${$1}${$2}src="file://${encodeFilePath ( filePath )}" class="attachment" data-filename="${$3}"${$4}>`;
          }
        },
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const basename = path.basename ( $2 );
            const filePath = Markdown.resolveTokenPath ( attachmentsPath, $2 );
            if ( !filePath ) return match;
            return `<a${$1}href="file://${encodeFilePath ( filePath )}" class="attachment button highlight" data-filename="${$2}"${$3}><i class="icon small">paperclip</i><span>${basename}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const filePath = Markdown.resolveTokenPath ( attachmentsPath, $2 );
            if ( !filePath ) return match;
            return `<a${$1}href="file://${encodeFilePath ( filePath )}" class="attachment" data-filename="${$2}"${$3}><i class="icon xsmall">paperclip</i>`;
          }
        }
      ];

    },

    note () {

      const {notesPath, notesToken: token} = Markdown._runtimeConfig;

      if ( !notesPath ) return [];

      return [
        { // <img>, <source>
          type: 'output',
          regex: `<(img|source)(.*?)src="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3, $4 ) {
            $3 = decodeURI ( $3 );
            const filePath = Markdown.resolveTokenPath ( notesPath, $3 );
            if ( !filePath ) return match;
            return `<${$1}${$2}src="file://${encodeFilePath ( filePath )}" class="note-asset" data-filepath="${filePath}"${$4}>`;
          }
        },
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const basename = path.basename ( $2 );
            const filePath = Markdown.resolveTokenPath ( notesPath, $2 );
            if ( !filePath ) return match;
            return `<a${$1}href="file://${encodeFilePath ( filePath )}" class="note button highlight" data-filepath="${filePath}"${$3}><i class="icon small">note</i><span>${basename}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const filePath = Markdown.resolveTokenPath ( notesPath, $2 );
            if ( !filePath ) return match;
            return `<a${$1}href="file://${encodeFilePath ( filePath )}" class="note" data-filepath="${filePath}"${$3}><i class="icon xsmall">note</i>`;
          }
        }
      ];

    },

    tag () {

      const {tagsToken: token} = Markdown._runtimeConfig;

      return [
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            return `<a${$1}href="#" class="tag button highlight" data-tag="${$2}"${$3}><i class="icon small">tag</i><span>${$2}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            return `<a${$1}href="#" class="tag" data-tag="${$2}"${$3}><i class="icon xsmall">tag</i>`;
          }
        }
      ];

    },

    noProtocolLinks () {

      return [{
        type: 'output',
        regex: /<a(.*?)href="(.*?)>/g,
        replace ( match, $1, $2 ) {
          if ( $2.startsWith ( '#' ) || isAbsoluteUrl ( $2 ) ) { // URL fragment or absolute URL
            return match;
          } else {
            return `<a${$1}href="https://${$2}>`;
          }
        }
      }];

    },

    wikilink () {

      const {notesExt: ext, notesRe: re, notesToken: token} = Markdown._runtimeConfig;

      return [{
        type: 'language',
        regex: /\[\[([^|\]]+?)(?:\|([^\]]+?))?\]\]/g,
        replace ( match, $1, $2, index, content ) {
          if ( Markdown.extensions.utilities.isInsideCode ( content, index, true ) ) return match;
          const title = $1;
          const note = $2 || $1;
          const isNotePath = re.test ( note );
          return `<a href="${token}/${note}${isNotePath ? '' : ext}">${title}</a>`;
        }
      }];

    }

  },

  converters: {

    preview: _.memoize ( () => ({
      makeHtml: ( str: string ) => Markdown.renderPreviewCmark ( str )
    })),

    strip: _.memoize ( () => ({
      makeHtml: ( str: string ) => Markdown.renderStripCmark ( str )
    }))

  },

  is: ( str: string ): boolean => { // Checks if `str` _could_ be using some Markdown features, it doesn't tell reliably when it actually is, only when it isn't. Useful for skipping unnecessary renderings

    return Markdown.re.test ( str );

  },

  render: ( str: string, limit: number = Infinity, sourceFilePath?: string ): string => {

    if ( !str || !Markdown.is ( str ) ) return `<p>${str}</p>`;

    str = Markdown.limiter ( str, limit ).trim ();

    return Markdown.renderPreviewCmark ( str, sourceFilePath );

  },

  renderAsync: async ( str: string, limit: number = Infinity, sourceFilePath?: string, shouldAbort?: () => boolean ): Promise<string> => {

    if ( !str || !Markdown.is ( str ) ) return `<p>${str}</p>`;

    str = Markdown.limiter ( str, limit ).trim ();

    return Markdown.renderPreviewCmarkAsync ( str, sourceFilePath, shouldAbort );

  },

  strip: ( str: string, limit: number = Infinity ): string => {

    if ( !str || !Markdown.is ( str ) ) return str;

    return Markdown.converters.strip ().makeHtml ( Markdown.limiter ( str, limit ) ).trim ().replace ( Markdown.wrapperRe, '$1' );

  },

  limiter: ( str: string, limit: number = Infinity ): string => {

    if ( !_.isFinite ( limit ) || limit <= 0 || str.length <= limit ) return str;

    return str.slice ( 0, limit );
  }

};

/* EXPORT */

export default Markdown;
