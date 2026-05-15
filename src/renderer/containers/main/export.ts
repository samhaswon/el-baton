
/* IMPORT */

import * as _ from 'lodash';
import {ipcRenderer as ipc} from 'electron';
import Dialog from 'electron-dialog';
import * as mime from 'mime-types';
import * as os from 'os';
import {Container, autosuspend} from 'overstated';
import * as path from 'path';
import MarkdownRenderHelpers from '@common/markdown_render_helpers';
import Config from '@common/config';
import File from '@renderer/utils/file';
import Markdown from '@renderer/utils/markdown';
import Path from '@renderer/utils/path';

/* EXPORT */

declare const __non_webpack_require__: NodeRequire;

const remote = require ( '@electron/remote' );

class Export extends Container<ExportState, MainCTX> {

  /* CONSTRUCTOR */

  constructor () {

    super ();

    autosuspend ( this );

  }

  /* HELPERS */

  _getResource = _.memoize ( async ( resource: string, options = { minify: true } ) => {

    let content = await File.read ( resource ) || '';

    if ( options.minify ) {

      content = content.replace ( / *\n+ */gm, '' );

    }

    return content;

  })

  _getResources = async ( resources: string[], options = { minify: true } ) => {

    const contents = await Promise.all ( resources.map ( resource => this._getResource ( resource, options ) ) );

    return contents.join ( '\n' );

  }

  _getFaviconTag = _.memoize ( async () => {

    const faviconPath = `${__static}/images/icon.png`,
          faviconBase64 = await File.read ( faviconPath, 'base64' );

    if ( !faviconBase64 ) return '';

    return `<link rel="shortcut icon" type="image/png" href="data:image/png;base64,${faviconBase64}">`;

  })

  _stringMatches = ( str: string, re: RegExp ): RegExpExecArray[] => {

    const flags = re.flags.includes ( 'g' ) ? re.flags : `${re.flags}g`,
          matchRe = new RegExp ( re.source, flags ),
          matches: RegExpExecArray[] = [];

    let match: RegExpExecArray | null;

    while (( match = matchRe.exec ( str ) )) {
      matches.push ( match );
      if ( match.index === matchRe.lastIndex ) {
        matchRe.lastIndex += 1;
      }
    }

    return matches;

  }

  _getCriticalHtml = async ( html: string ): Promise<string> => {

    try {

      const module = await import ( 'critically' ),
            critically = ( module as any ).default || module;

      return ( await critically ({ html }) ).html;

    } catch ( error ) {

      console.warn ( 'Failed to inline critical CSS for export, continuing with full stylesheet instead:', error );

      return html;

    }

  }

  _renderMermaidsForExport = async ( content: string, theme: 'default' | 'dark' = 'default' ): Promise<string> => {

    if ( !content.includes ( 'class="mermaid"' ) ) return content;

    const wrapper = document.createElement ( 'div' );

    wrapper.innerHTML = content;

    const nodes = Array.from ( wrapper.querySelectorAll ( '.mermaid' ) );

    if ( !nodes.length ) return content;

    const module = await import ( 'mermaid/dist/mermaid.esm.mjs' );
    const mermaid = ( module as any ).default || module;

    if ( mermaid.initialize ) {
      mermaid.initialize ( _.merge ({}, Config.mermaid, {
        startOnLoad: false,
        theme,
        themeVariables: {
          background: 'transparent'
        }
      }) );
    }

    for ( const node of nodes ) {

      const sourceNode = node.querySelector ( '.mermaid-source' );

      if ( !sourceNode?.textContent ) continue;

      const source = decodeURIComponent ( sourceNode.textContent );
      const externalButton = node.querySelector ( '.mermaid-open-external' );

      try {

        const result = await mermaid.render ( _.uniqueId ( 'export-mermaid-' ), source );
        const svg = _.isString ( result ) ? result : result.svg;
        const renderedErrorMessage = MarkdownRenderHelpers.getMermaidRenderedErrorMessage ( svg );

        if ( renderedErrorMessage ) {
          console.error ( `[mermaid export] ${renderedErrorMessage}` );
          node.innerHTML = MarkdownRenderHelpers.renderMermaidError ( renderedErrorMessage );
          continue;
        }

        node.innerHTML = '';

        if ( externalButton ) node.appendChild ( externalButton );

        node.insertAdjacentHTML ( 'beforeend', svg );

      } catch ( error ) {

        const message = error instanceof Error ? error.message : String ( error );

        console.error ( `[mermaid export] ${message}` );

      }

    }

    return wrapper.innerHTML;

  }

  /* RENDERERS */

  renderers = {

    html: async ( note: NoteObj, notePath: string, options = { base64: true, metadata: true, critical: true, favicon: true, scrollable: true } ) => {

      //TODO: Perhaps we should update the theme we are exporting to, as long as it's light, in order to not waste huge amounts of ink

      const css = await this._getResources ([
        __non_webpack_require__.resolve ( 'katex/dist/katex.min.css' ), // Simply using `require` won't work with WebPack
        `${__static}/css/notable.css`
      ]);

      const exportTheme = 'light';

      Markdown.setRuntimeConfig ({
        mermaidTheme: 'default'
      });

      let content = Markdown.render ( note.plainContent, Infinity, notePath ),
          metadata: string[] = [];

      content = await this._renderMermaidsForExport ( content, 'default' );

      if ( options.metadata ) {
        metadata.push (
          `<meta name="metadata:tags" content="${this.ctx.note.getTags ( note ).join ( ', ' )}">`,
          `<meta name="metadata:attachments" content="${this.ctx.note.getAttachments ( note ).join ( ', ' )}">`,
          `<meta name="metadata:deleted" content="${this.ctx.note.isDeleted ()}">`,
          `<meta name="metadata:favorited" content="${this.ctx.note.isFavorited ()}">`,
          `<meta name="metadata:pinned" content="${this.ctx.note.isPinned ()}">`,
          `<meta name="metadata:created" content="${this.ctx.note.getCreated ().toISOString ()}">`,
          `<meta name="metadata:modified" content="${this.ctx.note.getModified ().toISOString ()}">`
        );
      }

      const faviconTag = options.favicon ? await this._getFaviconTag () : '';

      let html = `
        <html>
          <head>
            <meta charset="utf-8">
            ${metadata.join ( '\n' )}
            <title>${note.metadata.title}</title>
            ${faviconTag}
            <style>${css}</style>
            ${options.scrollable ? '' : `
              <style>
                .preview code {
                  white-space: pre-wrap !important;
                }
              </style>
            `}
          </head>
          <body class="theme-${exportTheme}">
            <div class="preview">
              ${content}
            </div>
          </body>
        </html>
      `;

      if ( options.critical ) {
        html = await this._getCriticalHtml ( html );
      }

      if ( options.base64 ) { // Images
        const re = /<img([^>]*?)src="file:\/\/([^"]*)"/gi;
        const matches = this._stringMatches ( html, re );
        for ( const match of matches ) {
          const type = mime.lookup ( match[2] );
          const base64 = await File.read ( match[2], 'base64' );
          if ( mime && base64 ) {
            html = html.replace ( match[0], `<img${match[1]}src="data:${type};base64,${base64}"` );
          }
        }
      }

      if ( options.base64 ) { // Fonts
        const re = /url\("?([^)]*?\.woff2[^)]*?)"?\)/gi;
        const matches = this._stringMatches ( html, re );
        for ( const match of matches ) {
          const filePath = /katex/i.test ( match[1] ) ? __non_webpack_require__.resolve ( `katex/dist/${match[1]}` ): `${__static}/fonts/IconFont.woff2`; // Simply using `require` won't work with WebPack //UGLY
          const base64 = await File.read ( filePath, 'base64' );
          if ( base64 ) {
            html = html.replace ( match[0], `url(data:font/woff2;base64,${base64})` );
          }
        }
      }

      return html;

    },

    markdown: async ( note: NoteObj ) => {

      return note.content;

    },

    pdf: async ( note: NoteObj, dst: string ) => {

      const html = await this.renderers.html ( note, dst, { base64: true, metadata: false, critical: false, favicon: false, scrollable: false } );
      const tmpHtmlPath = path.join ( os.tmpdir (), `el-baton-export-${Date.now ()}-${Math.random ().toString ( 36 ).slice ( 2 )}.html` );
      let shouldCleanup = true;

      try {

        await File.write ( tmpHtmlPath, html );
        await ipc.invoke ( 'print-pdf', { src: tmpHtmlPath, dst } );

      } catch ( error ) {

        const message = error instanceof Error ? error.message : String ( error );

        if ( /No handler registered for 'print-pdf'/i.test ( message ) ) {

          ipc.send ( 'print-pdf', { src: tmpHtmlPath, dst } );
          shouldCleanup = false;

          setTimeout (() => {
            File.unlink ( tmpHtmlPath );
          }, 5 * 60 * 1000 );

          return;

        }

        throw error;

      } finally {

        if ( shouldCleanup ) {
          await File.unlink ( tmpHtmlPath );
        }

      }

    }

  }

  /* API */

  export = async ( notes: NoteObj[] = this.ctx.multiEditor.getNotes (), renderer: Function, extension: string ) => {

    if ( !notes.length ) return Dialog.alert ( 'No notes to export' );

    if ( !renderer || !extension ) return Dialog.alert ( 'Invalid export configuration' );

    const basePath = await this.dialog ();

    if ( !basePath ) return;

    const notesPath = basePath,
          attachmentsPath = path.join ( basePath, 'attachments' );

    await Promise.all ( notes.map ( async note => {

      /* CONTENT */

      const {name} = path.parse ( note.filePath ),
            baseName = `${name}.${extension}`,
            {filePath: notePath} = await Path.getAllowedPath ( notesPath, baseName ),
            content = await renderer ( note, notePath );

      if ( content ) {
        await File.write ( notePath, content );
      }

      /* ATTACHMENTS */

      const attachments = this.ctx.note.getAttachments ( note );

      await Promise.all ( attachments.map ( async fileName => {

        const attachment = this.ctx.attachment.get ( fileName );

        if ( !attachment ) return;

        const {filePath: attachmentPath} = await Path.getAllowedPath ( attachmentsPath, fileName );

        await File.copy ( attachment.filePath, attachmentPath );

      }));

    }));

  }

  exportHTML = ( notes: NoteObj[] = this.ctx.multiEditor.getNotes () ) => {

    return this.export ( notes, this.renderers.html, 'html' );

  }

  exportMarkdown = ( notes: NoteObj[] = this.ctx.multiEditor.getNotes () ) => {

    return this.export ( notes, this.renderers.markdown, 'md' );

  }

  exportPDF = ( notes: NoteObj[] = this.ctx.multiEditor.getNotes () ) => {

    return this.export ( notes, this.renderers.pdf, 'pdf' );

  }

  dialog = async (): Promise<string | undefined> => {

    const {canceled, filePaths} = await remote.dialog.showOpenDialog ({
      title: 'Export Notes',
      buttonLabel : 'Export',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: os.homedir ()
    });

    if ( canceled || !filePaths.length ) return;

    return filePaths[0];

  }

}

/* EXPORT */

export default Export;
