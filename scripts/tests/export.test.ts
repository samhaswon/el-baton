/* IMPORT */

import {beforeEach, afterEach, test} from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Module = require ( 'node:module' );

/* MODULE SETUP */

const originalLoad = ( Module as any )._load;
const alerts: string[] = [];
const ipcCalls: Array<{ channel: string, payload: any }> = [];
const pdfHtmlPayloads: string[] = [];

( Module as any )._load = function patchedLoad ( request: string, parent: NodeModule, isMain: boolean ) {

  if ( request === 'electron' ) {
    return {
      ipcRenderer: {
        invoke: async ( channel: string, payload: any ) => {
          ipcCalls.push ({ channel, payload });
          if ( channel === 'print-pdf' ) {
            pdfHtmlPayloads.push ( await fs.readFile ( payload.src, 'utf8' ) );
          }
        },
        send: ( channel: string, payload: any ) => {
          ipcCalls.push ({ channel, payload });
        }
      }
    };
  }

  if ( request === 'electron-dialog' ) {
    return {
      alert: ( message: string ) => {
        alerts.push ( message );
      }
    };
  }

  if ( request === '@electron/remote' ) {
    return {
      dialog: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      }
    };
  }

  if ( request === 'critically' ) {
    return async ({ html }: { html: string }) => ({ html });
  }

  if ( request === 'overstated' ) {
    return {
      Container: class {
        ctx: any;
      },
      autosuspend: () => {}
    };
  }

  if ( request === 'mime-types' ) {
    return {
      lookup: ( filePath: string ) => path.extname ( filePath ).toLowerCase () === '.png' ? 'image/png' : 'application/octet-stream'
    };
  }

  if ( request === '@renderer/utils/file' ) {
    return {
      __esModule: true,
      default: {
        copy: async ( srcPath: string, dstPath: string ) => {
          await fs.mkdir ( path.dirname ( dstPath ), { recursive: true } );
          await fs.copyFile ( srcPath, dstPath );
        },
        read: async ( filePath: string, encoding: BufferEncoding = 'utf8' ) => {
          try {
            return await fs.readFile ( filePath, encoding );
          } catch ( error ) {
            return;
          }
        },
        unlink: async ( filePath: string ) => {
          await fs.rm ( filePath, { force: true } );
        },
        write: async ( filePath: string, content: string ) => {
          await fs.mkdir ( path.dirname ( filePath ), { recursive: true } );
          await fs.writeFile ( filePath, content, 'utf8' );
        }
      }
    };
  }

  if ( request === '@renderer/utils/path' ) {
    return {
      __esModule: true,
      default: {
        getAllowedPath: async ( folderPath: string, baseName: string ) => {
          const parsed = path.parse ( baseName );

          for ( let i = 1;; i++ ) {
            const suffix = i > 1 ? ` (${i})` : '',
                  fileName = `${parsed.name}${suffix}${parsed.ext}`,
                  filePath = path.join ( folderPath, fileName );

            try {
              await fs.access ( filePath );
            } catch ( error ) {
              return { folderPath, filePath, fileName };
            }
          }
        }
      }
    };
  }

  if ( request === '@renderer/utils/markdown' ) {
    return {
      __esModule: true,
      default: {
        render: ( content: string, _limit: number, sourceFilePath?: string ) => content.replace ( /!\[([^\]]*)\]\(([^)]*)\)/g, ( _match, alt, target ) => {
          const sourceDir = sourceFilePath ? path.dirname ( sourceFilePath ) : tempRoot,
                filePath = path.resolve ( sourceDir, target );

          return `<img src="file://${filePath}" alt="${alt}">`;
        }),
        setRuntimeConfig: () => {}
      }
    };
  }

  if ( request === '@common/config' ) {
    return {
      __esModule: true,
      default: {
        mermaid: {}
      }
    };
  }

  if ( request === '@common/markdown_render_helpers' ) {
    return {
      __esModule: true,
      default: {
        getMermaidRenderedErrorMessage: () => undefined,
        renderMermaidError: ( message: string ) => `<p>${message}</p>`
      }
    };
  }

  return originalLoad.call ( this, request, parent, isMain );

};

const Export = require ( '../../src/renderer/containers/main/export' ).default;

/* HELPERS */

const tempRoot = path.join ( os.tmpdir (), 'el-baton-export-tests' );
const staticRoot = path.join ( tempRoot, 'static' );

const note = {
  filePath: path.join ( tempRoot, 'source', 'Test Note.md' ),
  content: '# Test Note',
  plainContent: '# Test Note',
  metadata: {
    title: 'Test Note'
  }
};

const sourceAttachmentPath = path.join ( tempRoot, 'source', 'asset.txt' );

const resetTempRoot = async (): Promise<void> => {

  await fs.rm ( tempRoot, { recursive: true, force: true } );
  await fs.mkdir ( path.join ( tempRoot, 'source' ), { recursive: true } );
  await fs.mkdir ( path.join ( staticRoot, 'css' ), { recursive: true } );
  await fs.mkdir ( path.join ( staticRoot, 'fonts' ), { recursive: true } );
  await fs.writeFile ( sourceAttachmentPath, 'attachment fixture', 'utf8' );
  await fs.writeFile ( path.join ( staticRoot, 'css', 'katex.min.css' ), '.katex{font-family:KaTeX_Main} @font-face{src:url(fonts/KaTeX_Main-Regular.woff2)}', 'utf8' );
  await fs.writeFile ( path.join ( staticRoot, 'css', 'notable.css' ), '.preview{font-family:IconFont} @font-face{src:url("../fonts/IconFont.woff2")}', 'utf8' );
  await fs.writeFile ( path.join ( staticRoot, 'fonts', 'KaTeX_Main-Regular.woff2' ), 'katex font', 'utf8' );
  await fs.writeFile ( path.join ( staticRoot, 'fonts', 'IconFont.woff2' ), 'icon font', 'utf8' );

};

const createStore = ( exportDir: string ) => {

  const store = new Export ();

  store.ctx = {
    attachment: {
      get: ( fileName: string ) => {
        if ( fileName !== 'asset.txt' ) return;
        return { filePath: sourceAttachmentPath };
      }
    },
    multiEditor: {
      getNotes: () => [note]
    },
    note: {
      getAttachments: () => ['asset.txt']
    },
    theme: {
      get: () => 'light'
    }
  };

  store.dialog = async () => exportDir;

  return store;

};

beforeEach ( async () => {

  alerts.length = 0;
  ipcCalls.length = 0;
  pdfHtmlPayloads.length = 0;
  ( globalThis as any ).__static = staticRoot;
  await resetTempRoot ();

} );

afterEach ( async () => {

  await fs.rm ( tempRoot, { recursive: true, force: true } );

} );

/* TESTS */

test ( 'renderers.html: reads KaTeX CSS and fonts from packaged static assets', async () => {

  const store = createStore ( path.join ( tempRoot, 'export-html' ) );
  const html = await store.renderers.html ( note, note.filePath, { base64: true, metadata: false, critical: false, favicon: false, scrollable: true } );

  assert.match ( html, /\.katex\{font-family:KaTeX_Main\}/ );
  assert.match ( html, /\.preview\{font-family:IconFont\}/ );
  assert.match ( html, /url\(data:font\/woff2;base64,a2F0ZXggZm9udA==\)/ );
  assert.match ( html, /url\(data:font\/woff2;base64,aWNvbiBmb250\)/ );

} );

test ( 'exportHTML: writes a suffixed html file and copied attachments into the selected directory', async () => {

  const exportDir = path.join ( tempRoot, 'export-html' );

  await fs.mkdir ( path.join ( exportDir, 'attachments' ), { recursive: true } );
  await fs.writeFile ( path.join ( exportDir, 'Test Note.html' ), 'existing html', 'utf8' );

  const store = createStore ( exportDir );

  store.renderers.html = async () => '<html><body>exported html</body></html>';

  await store.exportHTML ([note]);

  assert.equal ( await fs.readFile ( path.join ( exportDir, 'Test Note (2).html' ), 'utf8' ), '<html><body>exported html</body></html>' );
  assert.equal ( await fs.readFile ( path.join ( exportDir, 'attachments', 'asset.txt' ), 'utf8' ), 'attachment fixture' );
  assert.deepEqual ( alerts, [] );

} );

test ( 'exportMarkdown: writes a suffixed markdown file and copied attachments into the selected directory', async () => {

  const exportDir = path.join ( tempRoot, 'export-markdown' );

  await fs.mkdir ( path.join ( exportDir, 'attachments' ), { recursive: true } );
  await fs.writeFile ( path.join ( exportDir, 'Test Note.md' ), 'existing markdown', 'utf8' );

  const store = createStore ( exportDir );

  store.renderers.markdown = async () => '# exported markdown';

  await store.exportMarkdown ([note]);

  assert.equal ( await fs.readFile ( path.join ( exportDir, 'Test Note (2).md' ), 'utf8' ), '# exported markdown' );
  assert.equal ( await fs.readFile ( path.join ( exportDir, 'attachments', 'asset.txt' ), 'utf8' ), 'attachment fixture' );
  assert.deepEqual ( alerts, [] );

} );

test ( 'exportPDF: writes a suffixed pdf file via the pdf renderer and copied attachments into the selected directory', async () => {

  const exportDir = path.join ( tempRoot, 'export-pdf' );

  await fs.mkdir ( path.join ( exportDir, 'attachments' ), { recursive: true } );
  await fs.writeFile ( path.join ( exportDir, 'Test Note.pdf' ), 'existing pdf', 'utf8' );

  const store = createStore ( exportDir );

  store.renderers.pdf = async ( _note: typeof note, dst: string ) => {
    await fs.writeFile ( dst, 'pdf payload', 'utf8' );
  };

  await store.exportPDF ([note]);

  assert.equal ( await fs.readFile ( path.join ( exportDir, 'Test Note (2).pdf' ), 'utf8' ), 'pdf payload' );
  assert.equal ( await fs.readFile ( path.join ( exportDir, 'attachments', 'asset.txt' ), 'utf8' ), 'attachment fixture' );
  assert.deepEqual ( alerts, [] );
  assert.deepEqual ( ipcCalls, [] );

} );

test ( 'renderers.pdf: inlines images relative to the source note before printing', async () => {

  const exportDir = path.join ( tempRoot, 'export-pdf-relative-image' ),
        imagePath = path.join ( tempRoot, 'source', 'bible', 'mona_lisa_spaghetti.png' ),
        imageNote = {
          ...note,
          plainContent: '![an image of the Mona Lisa, but her hair is replaced with spaghetti](./bible/mona_lisa_spaghetti.png)'
        };

  await fs.mkdir ( path.dirname ( imagePath ), { recursive: true } );
  await fs.writeFile ( imagePath, 'png fixture', 'utf8' );

  const store = createStore ( exportDir );

  await store.renderers.pdf ( imageNote, path.join ( exportDir, 'Test Note.pdf' ) );

  assert.equal ( ipcCalls.length, 1 );
  assert.match ( pdfHtmlPayloads[0], /src="data:image\/png;base64,cG5nIGZpeHR1cmU="/ );
  assert.doesNotMatch ( pdfHtmlPayloads[0], /file:\/\// );

} );
