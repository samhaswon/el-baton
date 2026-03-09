/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );
const {spawnSync} = require ( 'child_process' );

let electron;

try {
  electron = require ( 'playwright' )._electron;
} catch ( error ) {
  console.error ( 'Missing dependency: playwright' );
  console.error ( 'Install it with: npm install --save-dev playwright' );
  process.exit ( 1 );
}

const rootPath = path.join ( __dirname, '..', '..' );
const demoDataPath = path.join ( rootPath, 'resources', 'demo_data' );
const demoSeedPath = path.join ( demoDataPath, 'seed' );
const demoWorkspacePath = path.join ( demoDataPath, 'workspace' );
const demoHomePath = path.join ( demoDataPath, '.home' );
const demoDefaultWorkspacePath = path.join ( demoHomePath, '.el-baton' );
const demoOutputPath = path.join ( rootPath, 'resources', 'demo' );
const appMainPath = path.join ( rootPath, 'dist', 'main', 'main.js' );

const windowSize = { width: 1365, height: 600 };

const noteFileNames = [
  '1 Test Note.md',
  'Test.md',
  'CSC 3300 CH1.md',
  'Matthew 7:1-6.md',
  'CSC 6400 Lecture 12.md',
  'CSC 3570 Labs Changelog.md',
  'Malformer Dataset Notes.md',
  'Malformer Packed.md'
];

const screenshots = [
  {
    fileName: 'main.png',
    theme: 'light',
    setup: async ctx => {
      await ctx.openCheatsheet ();
      await ctx.scrollCheatsheetToTutorial ();
    }
  },
  {
    fileName: 'dark.png',
    theme: 'dark',
    setup: async ctx => {
      await ctx.openExplorerPanel ();
      await ctx.openFirstNote ();
    }
  },
  {
    fileName: 'tags.png',
    theme: 'dark',
    setup: async ctx => {
      await ctx.openExplorerPanel ();
      await ctx.collapseSection ( 'Notes' );
      await ctx.collapseSection ( 'Notebooks' );
      await ctx.openTag ( 'Research' );
    }
  },
  {
    fileName: 'editor.png',
    theme: 'dark',
    setup: async ctx => {
      await ctx.openExplorerPanel ();
      await ctx.openFirstNote ();
      await ctx.enableEditing ();
    }
  },
  {
    fileName: 'multi_editor.png',
    theme: 'dark',
    setup: async ctx => {
      await ctx.openExplorerPanel ();
      await ctx.selectFirstTwoNotes (); 
    }
  },
  {
    fileName: 'zen_mode-split_editor-quick_open.png',
    theme: 'dark',
    setup: async ctx => {
      await ctx.openExplorerPanel ();
      await ctx.openNoteByTitle ( 'Malformer Packed' );
      await ctx.emit ( 'editor-split-toggle' );
      await ctx.waitForSelector ( '.split-editor' );
      await ctx.emit ( 'window-zen-toggle' );
      await ctx.waitForSelector ( '.main.app-wrapper.zen' );
      await ctx.emit ( 'quick-panel-toggle', true );
      await ctx.waitForSelector ( '.quick-panel input' );
      await ctx.typeQuickOpen ( 'malformer' );
    }
  }
];

const rmrf = targetPath => {
  if ( fs.existsSync ( targetPath ) ) {
    fs.rmSync ( targetPath, { recursive: true, force: true } );
  }
};

const mkdirp = targetPath => {
  fs.mkdirSync ( targetPath, { recursive: true } );
};

const copyDir = ( sourcePath, destinationPath ) => {
  mkdirp ( destinationPath );

  for ( const entry of fs.readdirSync ( sourcePath, { withFileTypes: true } ) ) {
    const sourceEntryPath = path.join ( sourcePath, entry.name );
    const destinationEntryPath = path.join ( destinationPath, entry.name );

    if ( entry.isDirectory () ) {
      copyDir ( sourceEntryPath, destinationEntryPath );
    } else if ( entry.isFile () ) {
      fs.copyFileSync ( sourceEntryPath, destinationEntryPath );
    }
  }
};

const writeSettings = ({ theme, panel = 'explorer' }) => {
  const settingsPath = path.join ( demoHomePath, '.el-baton.json' );
  const openTabs = noteFileNames.map ( fileName => path.join ( demoWorkspacePath, 'notes', fileName ) );

  const settings = {
    cwd: demoWorkspacePath,
    editor: {
      editing: false,
      openTabs,
      split: false
    },
    monaco: {
      editorOptions: {
        lineNumbers: 'on',
        minimap: {
          enabled: false
        },
        wordWrap: 'bounded'
      }
    },
    sorting: {
      by: 'title',
      type: 'ascending'
    },
    theme,
    tutorial: true,
    openCheatsheetOnStart: false,
    window: {
      sidebar: true,
      zen: false,
      panel
    }
  };

  mkdirp ( demoHomePath );
  fs.writeFileSync ( settingsPath, JSON.stringify ( settings, null, 2 ) + '\n' );
};

const wait = ms => new Promise ( resolve => setTimeout ( resolve, ms ) );

const ensurePrerequisites = () => {
  if ( !fs.existsSync ( appMainPath ) ) {
    throw new Error ( 'Missing dist/main/main.js. Run `npm run compile` (or `npm run compile:release`) first.' );
  }

  if ( !fs.existsSync ( demoSeedPath ) ) {
    throw new Error ( `Missing demo seed workspace: ${demoSeedPath}` );
  }
};

const hasArg = name => process.argv.includes ( name );

const maybeCompile = () => {
  if ( !hasArg ( '--compile' ) ) return;

  console.log ( '[demo] Running production compile before capture (--compile)' );

  const result = spawnSync ( 'npm', ['run', 'compile:release'], {
    cwd: rootPath,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  } );

  if ( result.status !== 0 ) {
    throw new Error ( 'compile failed' );
  }
};

const assertReleaseBundle = () => {
  if ( !fs.existsSync ( appMainPath ) ) return;

  const mainBundle = fs.readFileSync ( appMainPath, 'utf8' );

  // Development bundles are emitted with eval wrappers and hardcoded development environment.
  const looksLikeDevelopmentBundle = mainBundle.includes ( 'eval(\"{__webpack_require__' ) ||
    mainBundle.includes ( 'environment: \"development\"' ) ||
    mainBundle.includes ( "isDevelopment: \"development\" !== 'production'" );

  if ( looksLikeDevelopmentBundle ) {
    throw new Error ( 'dist/main/main.js appears to be a development bundle. Run `npm run compile:release` (or use `npm run screenshots:demo -- --compile`) and retry.' );
  }
};

const prepareRuntimePaths = () => {
  rmrf ( demoWorkspacePath );
  rmrf ( demoDefaultWorkspacePath );
  rmrf ( demoHomePath );
  copyDir ( demoSeedPath, demoWorkspacePath );
  copyDir ( demoSeedPath, demoDefaultWorkspacePath );
  mkdirp ( demoOutputPath );
};

const setWindowSize = async electronApp => {
  await electronApp.evaluate ( ({ BrowserWindow }, size ) => {
    const win = BrowserWindow.getAllWindows ()[0];

    if ( !win ) return;

    win.setSize ( size.width, size.height );
    win.center ();
  }, windowSize );
};

const emitIPC = async ( page, channel, ...args ) => {
  await page.evaluate ( ([nextChannel, nextArgs]) => {
    const {ipcRenderer} = require ( 'electron' );
    ipcRenderer.emit ( nextChannel, {}, ...nextArgs );
  }, [channel, args] );
};

const resolveRendererPage = async ( electronApp, preferredPage ) => {
  const windows = electronApp.windows ();
  const candidates = windows.filter ( win => !win.isClosed () && !win.url ().startsWith ( 'devtools://' ) );

  const selected = ( preferredPage && !preferredPage.isClosed () && !preferredPage.url ().startsWith ( 'devtools://' ) )
    ? preferredPage
    : candidates[0];

  if ( selected ) return selected;

  const nextWindow = await electronApp.waitForEvent ( 'window', { timeout: 30000 } );
  return nextWindow;
};

const ensureSidebarVisible = async page => {
  const hasActivitybar = async () => ( await page.locator ( '.activitybar' ).count () ) > 0;

  if ( await hasActivitybar () ) return;

  console.warn ( '[demo] Activitybar not visible yet, attempting sidebar toggle recovery' );

  for ( let attempt = 0; attempt < 4; attempt++ ) {
    await emitIPC ( page, 'window-sidebar-toggle' );
    await wait ( 250 );

    if ( await hasActivitybar () ) {
      console.log ( '[demo] Activitybar became visible after recovery toggle' );
      return;
    }
  }

  throw new Error ( 'Activitybar not visible after recovery attempts' );
};

const isMainRoute = async page => ( await page.locator ( '.mainbar' ).count () ) > 0;

const isCwdRoute = async page => ( await page.locator ( '.cwd.app-wrapper' ).count () ) > 0;

const ensureMainUI = async ( electronApp, page ) => {
  await page.waitForLoadState ( 'domcontentloaded', { timeout: 60000 } );

  await page.waitForFunction (() => {
    return !!document.querySelector ( '.mainbar, .cwd.app-wrapper, .app' );
  }, undefined, { timeout: 60000 } );

  await wait ( 300 );

  if ( await isMainRoute ( page ) ) return page;

  if ( !( await isCwdRoute ( page ) ) ) {
    const debug = await page.evaluate (() => ({
      href: window.location.href,
      title: document.title,
      readyState: document.readyState,
      hasAppRoot: !!document.querySelector ( '.app' ),
      bodyHtmlSnippet: document.body?.innerHTML?.slice ( 0, 500 ) || '',
      bodyTextSnippet: document.body?.innerText?.slice ( 0, 500 ) || ''
    }) );

    throw new Error ( `Unexpected startup route: main UI not found. Debug: ${JSON.stringify ( debug )}` );
  }

  console.warn ( '[demo] App started on CWD route, selecting default demo workspace' );

  const nextWindowPromise = electronApp.waitForEvent ( 'window', { timeout: 30000 } );

  await page.locator ( '.layout-footer .button.default' ).first ().click ();

  const nextPage = await nextWindowPromise;

  await nextPage.waitForFunction (() => document.readyState === 'complete', undefined, { timeout: 60000 } );
  await nextPage.waitForSelector ( '.mainbar', { timeout: 60000 } );

  return nextPage;
};

const createContext = ( page, electronApp ) => {
  const modifierKey = process.platform === 'darwin' ? 'Meta' : 'Control';
  let currentPage = page;

  const getPage = async () => {
    currentPage = await resolveRendererPage ( electronApp, currentPage );
    return currentPage;
  };

  const waitForSelector = async selector => {
    const livePage = await getPage ();
    await livePage.waitForSelector ( selector, { timeout: 20000 } );
  };

  const emit = async ( channel, ...args ) => {
    const livePage = await getPage ();
    await emitIPC ( livePage, channel, ...args );
    await wait ( 120 );
  };

  const openExplorerPanel = async () => {
    const livePage = await getPage ();

    if ( await livePage.locator ( '.sidepanel-pane.explorer.is-active' ).count () ) {
      await waitForSelector ( '.explorer-note.list-item' );
      return;
    }

    if ( !( await livePage.locator ( '.activitybar' ).count () ) ) {
      await emit ( 'window-sidebar-toggle' );
      await wait ( 200 );
    }

    await livePage.locator ( '.activitybar-item[title="Explorer"]' ).click ();
    await waitForSelector ( '.sidepanel-pane.explorer.is-active' );
    await waitForSelector ( '.explorer-note.list-item' );
  };

  const openCheatsheet = async () => {
    const livePage = await getPage ();
    await livePage.locator ( '.activitybar-item[title="Cheatsheets"]' ).click ();
    await waitForSelector ( '.cheatsheet-view' );
  };

  const scrollCheatsheetToTutorial = async () => {
    const livePage = await getPage ();

    await livePage.evaluate (() => {
      const tutorialHeading = Array.from ( document.querySelectorAll ( '.cheatsheet-view h2, .cheatsheet-view h3' ) )
        .find ( node => node.textContent?.trim () === 'Tutorial' );

      if ( !tutorialHeading ) return;

      const getScrollableAncestor = node => {
        let cursor = node.parentElement;

        while ( cursor ) {
          const style = getComputedStyle ( cursor );
          const overflowY = style.overflowY;
          const isScrollable = ( overflowY === 'auto' || overflowY === 'scroll' ) && cursor.scrollHeight > cursor.clientHeight;

          if ( isScrollable ) return cursor;

          cursor = cursor.parentElement;
        }

        return document.scrollingElement || document.documentElement;
      };

      const container = getScrollableAncestor ( tutorialHeading );
      const containerRect = container.getBoundingClientRect ();
      const headingRect = tutorialHeading.getBoundingClientRect ();
      const offset = 12;
      const delta = headingRect.top - containerRect.top - offset;

      container.scrollTop += delta;
    } );

    await wait ( 180 );
  };

  const openFirstNote = async () => {
    const livePage = await getPage ();
    const first = livePage.locator ( '.explorer-note.list-item' ).first ();
    await first.waitFor ({ state: 'visible', timeout: 20000 });
    await first.click ();
    await wait ( 150 );
  };

  const openNoteByTitle = async title => {
    const livePage = await getPage ();
    const note = livePage.locator ( `.explorer-note.list-item:has(.title:has-text("${title}"))` ).first ();
    await note.waitFor ({ state: 'visible', timeout: 20000 });
    await note.click ();
    await wait ( 150 );
  };

  const enableEditing = async () => {
    const livePage = await getPage ();
    const editButton = livePage.locator ( '.mainbar .toolbar .button[title="Edit"]' ).first ();
    await editButton.waitFor ({ state: 'visible', timeout: 20000 });
    await editButton.click ();
    await waitForSelector ( '.monaco-editor' );
  };

  const selectFirstTwoNotes = async () => {
    const livePage = await getPage ();
    const notes = livePage.locator ( '.explorer-note.list-item' );
    await notes.nth ( 1 ).waitFor ({ state: 'visible', timeout: 20000 });

    await notes.nth ( 0 ).click ();
    await livePage.keyboard.down ( modifierKey );
    await notes.nth ( 1 ).click ();
    await livePage.keyboard.up ( modifierKey );

    await waitForSelector ( '.multi-editor' );
  };

  const collapseSection = async name => {
    const livePage = await getPage ();
    const section = livePage.locator ( `.explorer-section:has(.title:has-text("${name}"))` ).first ();

    await section.waitFor ({ state: 'visible', timeout: 20000 });

    const className = await section.getAttribute ( 'class' );

    if ( className && className.includes ( 'collapsed' ) ) return;

    await section.click ();
    await wait ( 120 );
  };

  const openTag = async tagName => {
    const livePage = await getPage ();
    const tag = livePage.locator ( `.tag.list-item:has(.title:has-text("${tagName}"))` ).first ();

    if ( await tag.count () ) {
      await tag.waitFor ({ state: 'visible', timeout: 20000 });
      await tag.click ();
      await wait ( 120 );
      return;
    }

    const firstTag = livePage.locator ( '.tag.list-item' ).first ();
    await firstTag.waitFor ({ state: 'visible', timeout: 20000 });
    await firstTag.click ();
    await wait ( 120 );
  };

  const typeQuickOpen = async query => {
    const livePage = await getPage ();
    const input = livePage.locator ( '.quick-panel input[placeholder="Open note or attachment..."]' ).first ();
    await input.waitFor ({ state: 'visible', timeout: 20000 });
    await input.fill ( query );
    await wait ( 250 );
  };

  return {
    emit,
    openCheatsheet,
    scrollCheatsheetToTutorial,
    openExplorerPanel,
    openFirstNote,
    openNoteByTitle,
    enableEditing,
    selectFirstTwoNotes,
    collapseSection,
    openTag,
    typeQuickOpen,
    waitForSelector,
    getPage,
    electronApp
  };
};

const launchApp = async theme => {
  prepareRuntimePaths ();
  writeSettings ({ theme });

  const electronApp = await electron.launch ({
    args: ['.'],
    cwd: rootPath,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_WEBPACK_WDS_PORT: '',
      HOME: demoHomePath,
      USERPROFILE: demoHomePath
    }
  });

  const firstPage = await electronApp.firstWindow ();

  const currentURL = firstPage.url ();
  const page = currentURL.startsWith ( 'devtools://' ) && electronApp.windows ().length > 1
    ? await ensureMainUI ( electronApp, electronApp.windows ().find ( win => !win.url ().startsWith ( 'devtools://' ) ) || firstPage )
    : await ensureMainUI ( electronApp, firstPage );

  await setWindowSize ( electronApp );
  await page.waitForSelector ( '.mainbar', { timeout: 60000 } );
  await wait ( 700 );
  await ensureSidebarVisible ( page );
  await page.waitForSelector ( '.activitybar-item[title="Explorer"]', { timeout: 30000 } );

  return { electronApp, page };
};

const parseOnly = () => {
  const onlyArg = process.argv.find ( arg => arg.startsWith ( '--only=' ) );

  if ( !onlyArg ) return undefined;

  return new Set ( onlyArg.replace ( '--only=', '' ).split ( ',' ).map ( entry => entry.trim () ).filter ( Boolean ) );
};

const run = async () => {
  maybeCompile ();
  ensurePrerequisites ();
  assertReleaseBundle ();

  const only = parseOnly ();
  const planned = only ? screenshots.filter ( screenshot => only.has ( screenshot.fileName ) ) : screenshots;

  if ( !planned.length ) {
    throw new Error ( 'No screenshots selected. Use --only=<comma-separated-file-names> with valid demo screenshot file names.' );
  }

  for ( const screenshot of planned ) {
    const destinationPath = path.join ( demoOutputPath, screenshot.fileName );
    let electronApp;

    console.log ( `[demo] Capturing ${screenshot.fileName}` );

    try {
      const launched = await launchApp ( screenshot.theme );
      electronApp = launched.electronApp;

      const ctx = createContext ( launched.page, launched.electronApp );

      await screenshot.setup ( ctx );
      await wait ( 180 );
      const activePage = await ctx.getPage ();
      await activePage.screenshot ({ path: destinationPath });

      console.log ( `[demo] Wrote ${path.relative ( rootPath, destinationPath )}` );
    } catch ( error ) {
      if ( electronApp ) {
        try {
          const pages = electronApp.windows ();
          const livePage = pages.find ( page => !page.isClosed () && !page.url ().startsWith ( 'devtools://' ) ) || pages[0];

          if ( livePage ) {
            const debugPath = path.join ( demoOutputPath, `${screenshot.fileName}.debug.png` );
            await livePage.screenshot ({ path: debugPath });
            console.error ( `[demo] Wrote debug screenshot: ${path.relative ( rootPath, debugPath )}` );
          }
        } catch ( debugError ) {
          console.error ( '[demo] Failed to write debug screenshot:', debugError.message || debugError );
        }
      }

      throw error;
    } finally {
      if ( electronApp ) {
        await electronApp.close ();
      }
    }
  }

  console.log ( '[demo] Done' );
};

run ().catch ( error => {
  console.error ( '[demo] Failed:', error.message || error );
  process.exit ( 1 );
});
