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

( Module as any )._load = function patchedLoad ( request: string, parent: NodeModule, isMain: boolean ) {

  if ( request === 'electron' ) {
    return {
      ipcRenderer: {
        invoke: async ( channel: string, payload: any ) => {
          ipcCalls.push ({ channel, payload });
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
      lookup: () => 'application/octet-stream'
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
        render: () => '',
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

  return originalLoad.call ( this, request, parent, isMain );

};

const Export = require ( '../../src/renderer/containers/main/export' ).default;

/* HELPERS */

const tempRoot = path.join ( os.tmpdir (), 'el-baton-export-tests' );

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
  await fs.writeFile ( sourceAttachmentPath, 'attachment fixture', 'utf8' );

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
  await resetTempRoot ();

} );

afterEach ( async () => {

  await fs.rm ( tempRoot, { recursive: true, force: true } );

} );

/* TESTS */

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
