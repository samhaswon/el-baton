/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );
const assert = require ( 'node:assert/strict' );
const {test} = require ( 'node:test' );
const YAML = require ( 'js-yaml' );

let electron;

try {
  electron = require ( 'playwright' )._electron;
} catch ( error ) {
  throw new Error ( 'Missing dependency: playwright. Install dependencies with `npm install`.' );
}

const rootPath = path.join ( __dirname, '..', '..' );
const demoSeedPath = path.join ( rootPath, 'resources', 'demo_data', 'seed' );
const appMainPath = path.join ( rootPath, 'dist', 'main', 'main.js' );
const runtimeRootPath = path.join ( rootPath, '.tmp', 'ui_tests' );
const windowSize = { width: 1365, height: 720 };
const hasDisplayServer = Boolean ( process.env.DISPLAY || process.env.WAYLAND_DISPLAY || process.env.MIR_SOCKET );
const shouldSkipForMissingDisplay = process.platform === 'linux' && !hasDisplayServer && process.env.EL_BATON_UI_TESTS_FORCE !== '1';

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

const wait = ms => new Promise ( resolve => setTimeout ( resolve, ms ) );
const ariaToBool = value => value === 'true';

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

const ensurePrerequisites = () => {
  if ( !fs.existsSync ( appMainPath ) ) {
    throw new Error ( 'Missing dist/main/main.js. Run `npm run compile:release` first.' );
  }

  if ( !fs.existsSync ( demoSeedPath ) ) {
    throw new Error ( `Missing demo seed workspace: ${demoSeedPath}` );
  }
};

const assertReleaseBundle = () => {
  const mainBundle = fs.readFileSync ( appMainPath, 'utf8' );
  const looksLikeDevelopmentBundle = mainBundle.includes ( 'eval(\"{__webpack_require__' ) ||
    mainBundle.includes ( 'environment: \"development\"' ) ||
    mainBundle.includes ( "isDevelopment: \"development\" !== 'production'" );

  if ( looksLikeDevelopmentBundle ) {
    throw new Error ( 'dist/main/main.js appears to be a development bundle. Run `npm run compile:release` and retry.' );
  }
};

const createRuntimePaths = runtimeId => {
  const runtimeBasePath = path.join ( runtimeRootPath, runtimeId );

  return {
    runtimeBasePath,
    workspacePath: path.join ( runtimeBasePath, 'workspace' ),
    homePath: path.join ( runtimeBasePath, 'home' ),
    defaultWorkspacePath: path.join ( runtimeBasePath, 'home', '.el-baton' )
  };
};

const prepareRuntimePaths = runtimePaths => {
  rmrf ( runtimePaths.runtimeBasePath );
  copyDir ( demoSeedPath, runtimePaths.workspacePath );
  copyDir ( demoSeedPath, runtimePaths.defaultWorkspacePath );
};

const writeSettings = ({ theme, panel = 'explorer', runtimePaths }) => {
  const settingsPath = path.join ( runtimePaths.homePath, '.el-baton.json' );
  const openTabs = noteFileNames.map ( fileName => path.join ( runtimePaths.workspacePath, 'notes', fileName ) );

  const settings = {
    cwd: runtimePaths.workspacePath,
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

  mkdirp ( runtimePaths.homePath );
  fs.writeFileSync ( settingsPath, JSON.stringify ( settings, null, 2 ) + '\n' );
};

const resolveRendererPage = async ( electronApp, preferredPage ) => {
  const windows = electronApp.windows ();
  const candidates = windows.filter ( win => !win.isClosed () && !win.url ().startsWith ( 'devtools://' ) );

  const selected = ( preferredPage && !preferredPage.isClosed () && !preferredPage.url ().startsWith ( 'devtools://' ) )
    ? preferredPage
    : candidates[0];

  if ( selected ) return selected;

  return electronApp.waitForEvent ( 'window', { timeout: 30000 } );
};

const isPageClosedError = error => {
  const message = String ( error && error.message ? error.message : error );
  return message.includes ( 'Target page, context or browser has been closed' );
};

const ensureStartupRouteReady = async ( electronApp, initialPage, timeout = 60000 ) => {
  const deadline = Date.now () + timeout;
  let page = initialPage;

  while ( Date.now () < deadline ) {
    page = await resolveRendererPage ( electronApp, page );

    const remaining = Math.max ( 1000, Math.min ( 12000, deadline - Date.now () ) );

    try {
      await page.waitForLoadState ( 'domcontentloaded', { timeout: remaining } );
      await page.waitForFunction (() => !!document.querySelector ( '.mainbar, .cwd.app-wrapper, .app' ), undefined, { timeout: remaining } );
      await wait ( 250 );
      return page;
    } catch ( error ) {
      if ( !isPageClosedError ( error ) ) throw error;
      await wait ( 120 );
    }
  }

  throw new Error ( 'Timed out waiting for main or cwd route to become available' );
};

const isMainRoute = async page => ( await page.locator ( '.mainbar' ).count () ) > 0;
const isCwdRoute = async page => ( await page.locator ( '.cwd.app-wrapper' ).count () ) > 0;

const ensureMainUI = async ( electronApp, page ) => {
  let livePage = await ensureStartupRouteReady ( electronApp, page, 60000 );

  if ( await isMainRoute ( livePage ) ) return livePage;

  if ( !( await isCwdRoute ( livePage ) ) ) {
    const debug = await livePage.evaluate (() => ({
      href: window.location.href,
      title: document.title,
      readyState: document.readyState,
      bodyTextSnippet: document.body?.innerText?.slice ( 0, 300 ) || ''
    }) );
    throw new Error ( `Unexpected startup route: ${JSON.stringify ( debug )}` );
  }

  const nextWindowPromise = electronApp.waitForEvent ( 'window', { timeout: 30000 } );
  await livePage.locator ( '.layout-footer .button.default' ).first ().click ();
  const nextPage = await nextWindowPromise;

  livePage = await ensureStartupRouteReady ( electronApp, nextPage, 60000 );
  await livePage.waitForSelector ( '.mainbar', { timeout: 60000 } );

  return livePage;
};

const setWindowSize = async electronApp => {
  await electronApp.evaluate ( ({ BrowserWindow }, size ) => {
    const win = BrowserWindow.getAllWindows ()[0];

    if ( !win ) return;

    win.setSize ( size.width, size.height );
    win.center ();
  }, windowSize );
};

const ensureSidebarVisible = async page => {
  const hasActivitybar = async () => ( await page.locator ( '.activitybar' ).count () ) > 0;

  if ( await hasActivitybar () ) return;

  await page.evaluate (() => {
    const {ipcRenderer} = require ( 'electron' );
    ipcRenderer.emit ( 'window-sidebar-toggle' );
  } );

  await page.waitForSelector ( '.activitybar', { timeout: 20000 } );
};

const launchApp = async ({ runtimeId, theme = 'dark' }) => {
  const runtimePaths = createRuntimePaths ( runtimeId );

  prepareRuntimePaths ( runtimePaths );
  writeSettings ({ theme, runtimePaths });

  const electronApp = await electron.launch ({
    args: ['.'],
    cwd: rootPath,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_WEBPACK_WDS_PORT: '',
      HOME: runtimePaths.homePath,
      USERPROFILE: runtimePaths.homePath
    }
  });

  const firstPage = await electronApp.firstWindow ();
  const page = await ensureMainUI ( electronApp, await resolveRendererPage ( electronApp, firstPage ) );

  await setWindowSize ( electronApp );
  await page.waitForSelector ( '.mainbar', { timeout: 60000 } );
  await ensureSidebarVisible ( page );
  await page.waitForSelector ( '.activitybar-item[title="Explorer"]', { timeout: 30000 } );

  return {
    electronApp,
    page: await resolveRendererPage ( electronApp, page ),
    runtimePaths
  };
};

const launchAppOrSkip = async ( t, options ) => {
  try {
    return await launchApp ( options );
  } catch ( error ) {
    const message = String ( error && error.message ? error.message : error );

    if ( message.includes ( 'Process failed to launch!' ) ) {
      t.skip ( `Electron could not launch in this environment (${message})` );
      return undefined;
    }

    throw error;
  }
};

const emitIPC = async ( page, channel, ...args ) => {
  await page.evaluate ( ([nextChannel, nextArgs]) => {
    const {ipcRenderer} = require ( 'electron' );
    ipcRenderer.emit ( nextChannel, {}, ...nextArgs );
  }, [channel, args] );
};

const clickActivitybar = async ( page, title ) => {
  await page.locator ( `.activitybar-item[title="${title}"]` ).click ();
  await wait ( 140 );
};

const hasVisible = async ( page, selector ) => ( await page.locator ( selector ).count () ) > 0;

const ensureActivitybarPanelOpen = async ( page, title, visibleSelector, timeout = 20000 ) => {
  const deadline = Date.now () + timeout;
  const tabSelector = `.activitybar-item[title="${title}"]`;
  const settleMs = 220;

  while ( Date.now () < deadline ) {
    if ( await hasVisible ( page, visibleSelector ) ) return;

    const className = await page.locator ( tabSelector ).first ().getAttribute ( 'class' );
    const isActive = ( className || '' ).includes ( 'active' );

    // Avoid double-toggling an already active panel while transition classes settle.
    if ( !isActive ) {
      await clickActivitybar ( page, title );
    }

    await wait ( settleMs );
  }

  const finalClassName = await page.locator ( tabSelector ).first ().getAttribute ( 'class' );
  const finalVisible = await hasVisible ( page, visibleSelector );

  assert.ok ( finalVisible, `Panel "${title}" did not open for selector "${visibleSelector}" (tab class: "${finalClassName || ''}")` );
};

const ensureActivitybarTabActive = async ( page, title, timeout = 20000 ) => {
  const deadline = Date.now () + timeout;

  while ( Date.now () < deadline ) {
    const className = await page.locator ( `.activitybar-item[title="${title}"]` ).first ().getAttribute ( 'class' );

    if ( ( className || '' ).includes ( 'active' ) ) return;

    await clickActivitybar ( page, title );
  }

  const finalClassName = await page.locator ( `.activitybar-item[title="${title}"]` ).first ().getAttribute ( 'class' );
  assert.ok ( ( finalClassName || '' ).includes ( 'active' ), `Expected activitybar tab "${title}" to be active` );
};

const waitForAttributeChange = async ( locator, attribute, previousValue, timeout = 6000 ) => {
  const deadline = Date.now () + timeout;

  while ( Date.now () < deadline ) {
    const nextValue = await locator.getAttribute ( attribute );
    if ( nextValue !== previousValue ) return nextValue;
    await wait ( 100 );
  }

  throw new Error ( `Timed out waiting for "${attribute}" to change from "${previousValue}"` );
};

const waitForInputValue = async ( locator, expectedValue, timeout = 6000 ) => {
  const deadline = Date.now () + timeout;

  while ( Date.now () < deadline ) {
    if ( await locator.inputValue () === expectedValue ) return;
    await wait ( 100 );
  }

  throw new Error ( `Timed out waiting for input value "${expectedValue}"` );
};

const waitForEnabled = async ( locator, timeout = 6000 ) => {
  const deadline = Date.now () + timeout;

  while ( Date.now () < deadline ) {
    if ( !( await locator.isDisabled () ) ) return;
    await wait ( 100 );
  }

  throw new Error ( 'Timed out waiting for control to become enabled' );
};

const getDotPathValue = ( object, dotPath ) => {
  return dotPath.split ( '.' ).reduce ( ( current, key ) => ( current && Object.prototype.hasOwnProperty.call ( current, key ) ) ? current[key] : undefined, object );
};

const readConfigFile = filePath => {
  const raw = fs.readFileSync ( filePath, 'utf8' );
  const extension = path.extname ( filePath ).toLowerCase ();

  if ( extension === '.json' ) {
    return JSON.parse ( raw );
  }

  return YAML.load ( raw ) || {};
};

const waitForConfigPathValue = async ( filePath, dotPath, expectedValue, timeout = 10000 ) => {
  const deadline = Date.now () + timeout;
  let lastValue;

  while ( Date.now () < deadline ) {
    if ( fs.existsSync ( filePath ) ) {
      const config = readConfigFile ( filePath );
      const nextValue = getDotPathValue ( config, dotPath );

      lastValue = nextValue;

      if ( JSON.stringify ( nextValue ) === JSON.stringify ( expectedValue ) ) return;
    }

    await wait ( 120 );
  }

  throw new Error ( `Timed out waiting for config "${dotPath}" to become ${JSON.stringify ( expectedValue )}. Last value: ${JSON.stringify ( lastValue )}` );
};

const waitForConfigPredicate = async ( filePath, description, predicate, timeout = 10000 ) => {
  const deadline = Date.now () + timeout;
  let lastConfig = {};

  while ( Date.now () < deadline ) {
    if ( fs.existsSync ( filePath ) ) {
      const config = readConfigFile ( filePath );
      lastConfig = config;

      if ( predicate ( config ) ) return;
    }

    await wait ( 120 );
  }

  throw new Error ( `Timed out waiting for config condition: ${description}. Last config snapshot: ${JSON.stringify ( lastConfig )}` );
};

const openExplorerAndFirstNote = async page => {
  await ensureActivitybarPanelOpen ( page, 'Explorer', '.sidepanel-pane.explorer.is-active' );
  const firstNote = page.locator ( '.explorer-note.list-item' ).first ();
  await firstNote.waitFor ({ state: 'visible', timeout: 20000 });
  await firstNote.click ();
  await wait ( 150 );
};

test ( 'ui: launches the main window and shows explorer notes', { timeout: 120000 }, async t => {
  if ( shouldSkipForMissingDisplay ) {
    t.skip ( 'UI tests require a Linux display server. Set EL_BATON_UI_TESTS_FORCE=1 to override.' );
  }

  ensurePrerequisites ();
  assertReleaseBundle ();

  const launched = await launchAppOrSkip ( t, { runtimeId: 'launch-main', theme: 'dark' } );

  if ( !launched ) return;

  const {electronApp, page, runtimePaths} = launched;

  t.after ( async () => {
    await electronApp.close ();
    rmrf ( runtimePaths.runtimeBasePath );
  } );

  assert.equal ( await page.locator ( '.mainbar' ).count (), 1 );
  await ensureActivitybarPanelOpen ( page, 'Explorer', '.sidepanel-pane.explorer.is-active' );
  assert.ok ( await page.locator ( '.explorer-note.list-item' ).count () > 0 );
} );

test ( 'ui: activitybar panels render expected sidepanel and mainbar views', { timeout: 120000 }, async t => {
  if ( shouldSkipForMissingDisplay ) {
    t.skip ( 'UI tests require a Linux display server. Set EL_BATON_UI_TESTS_FORCE=1 to override.' );
  }

  ensurePrerequisites ();
  assertReleaseBundle ();

  const launched = await launchAppOrSkip ( t, { runtimeId: 'activitybar-panels', theme: 'light' } );

  if ( !launched ) return;

  const {electronApp, page, runtimePaths} = launched;

  t.after ( async () => {
    await electronApp.close ();
    rmrf ( runtimePaths.runtimeBasePath );
  } );

  await ensureActivitybarPanelOpen ( page, 'Explorer', '.sidepanel-pane.explorer.is-active' );
  assert.ok ( await page.locator ( '.explorer-note.list-item' ).count () > 0 );

  await ensureActivitybarPanelOpen ( page, 'Global Search', '.sidepanel-pane.search.is-active' );
  await page.waitForSelector ( '.sidepanel-pane.search input[placeholder="Search..."]', { timeout: 20000 } );

  await ensureActivitybarPanelOpen ( page, 'Graph', '.sidepanel-pane.is-active .toolbar .small' );
  await ensureActivitybarTabActive ( page, 'Graph' );
  assert.ok ( await page.locator ( '.sidepanel-pane.is-active .value.small' ).first ().innerText () === 'TODO' );

  await ensureActivitybarTabActive ( page, 'Info' );
  await page.waitForSelector ( '.sidepanel-pane-info, .mainbar-pane-info', { timeout: 20000 } );
  const infoHeader = await page.evaluate (() => {
    const candidates = Array.from ( document.querySelectorAll ( '.sidepanel-pane-info .toolbar .small, .mainbar-pane-info .toolbar .small' ) );
    const firstWithText = candidates.find ( node => ( node.textContent || '' ).trim ().length > 0 );
    return firstWithText ? firstWithText.textContent.trim () : '';
  } );
  assert.equal ( infoHeader, 'Table of Contents' );

  await clickActivitybar ( page, 'Cheatsheets' );
  await page.waitForSelector ( '.cheatsheet-view', { timeout: 20000 } );

  const hasTutorialHeading = await page.evaluate (() => {
    return Array.from ( document.querySelectorAll ( '.cheatsheet-view h2, .cheatsheet-view h3' ) )
      .some ( node => node.textContent?.trim () === 'Tutorial' );
  } );

  assert.equal ( hasTutorialHeading, true );

  await clickActivitybar ( page, 'Settings' );
  await page.waitForSelector ( '.settings-view', { timeout: 20000 } );
  await page.waitForSelector ( '.settings-hero-title', { timeout: 20000 } );
  const settingsTitle = await page.locator ( '.settings-hero-title' ).first ().innerText ();
  assert.equal ( settingsTitle.trim (), 'Global Configuration' );
} );

test ( 'ui: note interactions support local search, split view, and quick open', { timeout: 120000 }, async t => {
  if ( shouldSkipForMissingDisplay ) {
    t.skip ( 'UI tests require a Linux display server. Set EL_BATON_UI_TESTS_FORCE=1 to override.' );
  }

  ensurePrerequisites ();
  assertReleaseBundle ();

  const launched = await launchAppOrSkip ( t, { runtimeId: 'note-interactions', theme: 'dark' } );

  if ( !launched ) return;

  const {electronApp, page, runtimePaths} = launched;

  t.after ( async () => {
    await electronApp.close ();
    rmrf ( runtimePaths.runtimeBasePath );
  } );

  await openExplorerAndFirstNote ( page );
  await page.waitForSelector ( '.note-tabs .note-tab', { timeout: 20000 } );

  await emitIPC ( page, 'search-focus' );
  await page.waitForSelector ( '.local-search input[placeholder="Search in note..."]', { timeout: 20000 } );
  await page.locator ( '.local-search input[placeholder="Search in note..."]' ).fill ( 'test' );
  await page.locator ( '.local-search-regex' ).click ();
  const isRegexActive = await page.locator ( '.local-search-regex' ).first ().getAttribute ( 'class' );
  assert.ok ( ( isRegexActive || '' ).includes ( 'active' ) );

  await emitIPC ( page, 'editor-split-toggle' );
  await page.waitForSelector ( '.split-editor', { timeout: 20000 } );

  await emitIPC ( page, 'quick-panel-toggle', true );
  await page.waitForSelector ( '.quick-panel input[placeholder="Open note or attachment..."]', { timeout: 20000 } );
  await page.locator ( '.quick-panel input[placeholder="Open note or attachment..."]' ).fill ( 'malformer' );
  await wait ( 200 );
  assert.ok ( await page.locator ( '.quick-panel .list-item' ).count () > 0 );
} );

test ( 'ui: settings non-battery options are interactive', { timeout: 120000 }, async t => {
  if ( shouldSkipForMissingDisplay ) {
    t.skip ( 'UI tests require a Linux display server. Set EL_BATON_UI_TESTS_FORCE=1 to override.' );
  }

  ensurePrerequisites ();
  assertReleaseBundle ();

  const launched = await launchAppOrSkip ( t, { runtimeId: 'settings-controls', theme: 'dark' } );

  if ( !launched ) return;

  const {electronApp, page, runtimePaths} = launched;

  t.after ( async () => {
    await electronApp.close ();
    rmrf ( runtimePaths.runtimeBasePath );
  } );

  const openSettingsView = async () => {
    await ensureActivitybarTabActive ( page, 'Settings' );
    await page.waitForSelector ( '.settings-view', { timeout: 20000 } );
  };

  await openSettingsView ();

  const configFilePath = ( await page.locator ( '.settings-path' ).first ().innerText () ).trim ();
  assert.ok ( !!configFilePath, 'Expected a non-empty config file path in settings UI' );

  const getSection = name => page.locator ( '.settings-section' ).filter ({
    has: page.locator ( '.settings-section-name', { hasText: name } )
  }).first ();

  const getField = ( sectionLocator, label ) => sectionLocator.locator ( '.settings-field' ).filter ({
    hasText: label
  }).first ();

  const getFieldSelect = async ( sectionLocator, label ) => {
    const field = getField ( sectionLocator, label );
    await field.scrollIntoViewIfNeeded ();
    const select = field.locator ( 'select.settings-select' ).first ();
    await select.waitFor ({ state: 'attached', timeout: 20000 });
    return select;
  };

  const generalSection = getSection ( 'General' );
  await generalSection.waitFor ({ state: 'visible', timeout: 20000 });

  const autoUpdateSwitch = generalSection.locator ( 'button.settings-switch[aria-label="Toggle automatic update checks"]' ).first ();
  const autoUpdatePrev = await autoUpdateSwitch.getAttribute ( 'aria-pressed' );
  await autoUpdateSwitch.click ();
  const autoUpdateNext = await waitForAttributeChange ( autoUpdateSwitch, 'aria-pressed', autoUpdatePrev );
  await waitForConfigPathValue ( configFilePath, 'autoupdate', ariaToBool ( autoUpdateNext ) );

  const useGpuSwitch = generalSection.locator ( 'button.settings-switch[aria-label="Toggle use GPU"]' ).first ();
  const useGpuPrev = await useGpuSwitch.getAttribute ( 'aria-pressed' );
  await useGpuSwitch.click ();
  const useGpuNext = await waitForAttributeChange ( useGpuSwitch, 'aria-pressed', useGpuPrev );
  await waitForConfigPathValue ( configFilePath, 'performance.highPerformanceMode', ariaToBool ( useGpuNext ) );

  const editorSection = getSection ( 'Editor' );
  await editorSection.waitFor ({ state: 'visible', timeout: 20000 });

  const lineNumbersSelect = await getFieldSelect ( editorSection, 'Line numbers' );
  const lineNumbersPrev = await lineNumbersSelect.inputValue ();
  const lineNumbersNext = lineNumbersPrev === 'relative' ? 'on' : 'relative';
  await lineNumbersSelect.selectOption ( lineNumbersNext );
  await waitForInputValue ( lineNumbersSelect, lineNumbersNext );
  await waitForConfigPathValue ( configFilePath, 'monaco.editorOptions.lineNumbers', lineNumbersNext );

  const tabSizeSelect = await getFieldSelect ( editorSection, 'Tab size' );
  const tabSizePrev = await tabSizeSelect.inputValue ();
  const tabSizeNext = tabSizePrev === '4' ? '2' : '4';
  await tabSizeSelect.selectOption ( tabSizeNext );
  await waitForInputValue ( tabSizeSelect, tabSizeNext );
  await waitForConfigPathValue ( configFilePath, 'monaco.editorOptions.tabSize', Number ( tabSizeNext ) );

  const disableSuggestionsSwitch = editorSection.locator ( 'button.settings-switch[aria-label="Toggle autocomplete suggestions"]' ).first ();
  const disableSuggestionsPrev = await disableSuggestionsSwitch.getAttribute ( 'aria-pressed' );
  await disableSuggestionsSwitch.click ();
  const disableSuggestionsNext = await waitForAttributeChange ( disableSuggestionsSwitch, 'aria-pressed', disableSuggestionsPrev );
  await waitForConfigPathValue ( configFilePath, 'monaco.editorOptions.disableSuggestions', ariaToBool ( disableSuggestionsNext ) );

  const disableTableFormattingSwitch = editorSection.locator ( 'button.settings-switch[aria-label="Toggle automatic table formatting"]' ).first ();
  const disableTableFormattingPrev = await disableTableFormattingSwitch.getAttribute ( 'aria-pressed' );
  await disableTableFormattingSwitch.click ();
  const disableTableFormattingNext = await waitForAttributeChange ( disableTableFormattingSwitch, 'aria-pressed', disableTableFormattingPrev );
  await waitForConfigPathValue ( configFilePath, 'monaco.disableAutomaticTableFormatting', ariaToBool ( disableTableFormattingNext ) );

  const tableFormatDelaySelect = await getFieldSelect ( editorSection, 'Automatic table format delay' );
  assert.equal ( await tableFormatDelaySelect.isDisabled (), disableTableFormattingNext === 'true' );

  const spellcheckSection = getSection ( 'Spellcheck Dictionary' );
  await spellcheckSection.waitFor ({ state: 'visible', timeout: 20000 });
  const showDictionaryButton = spellcheckSection.locator ( 'button.settings-action.settings-action-inline' ).first ();
  await showDictionaryButton.click ();
  const dictionaryInput = spellcheckSection.locator ( 'input.settings-input-spellcheck' ).first ();
  await dictionaryInput.waitFor ({ state: 'visible', timeout: 20000 });
  const randomSuffix = Array.from ({ length: 7 }, () => String.fromCharCode ( 97 + Math.floor ( Math.random () * 26 ) ) ).join ( '' );
  const testWord = `playwright${randomSuffix}`;
  await dictionaryInput.fill ( testWord );
  const addWordButton = spellcheckSection.locator ( 'button', { hasText: 'Add Word' } ).first ();
  await waitForEnabled ( addWordButton, 10000 );
  await addWordButton.click ();
  const addedWord = spellcheckSection.locator ( '.settings-spellcheck-word', { hasText: testWord } ).first ();
  await addedWord.waitFor ({ state: 'visible', timeout: 20000 });
  await waitForConfigPredicate ( configFilePath, 'spellcheck.addedWords includes newly added word', config => {
    const words = getDotPathValue ( config, 'spellcheck.addedWords' ) || [];
    return Array.isArray ( words ) && words.includes ( testWord );
  } );
  const wordRow = spellcheckSection.locator ( '.settings-spellcheck-item', { hasText: testWord } ).first ();
  await wordRow.scrollIntoViewIfNeeded ();
  const removeWordButton = wordRow.locator ( 'button.settings-spellcheck-remove' ).first ();
  await removeWordButton.waitFor ({ state: 'visible', timeout: 20000 });
  await removeWordButton.click ();
  await addedWord.waitFor ({ state: 'hidden', timeout: 20000 });
  await waitForConfigPredicate ( configFilePath, 'spellcheck.addedWords excludes removed word', config => {
    const words = getDotPathValue ( config, 'spellcheck.addedWords' ) || [];
    return Array.isArray ( words ) && !words.includes ( testWord );
  } );

  const notesSection = getSection ( 'Notes' );
  await notesSection.waitFor ({ state: 'visible', timeout: 20000 });
  const disableRenameSwitch = notesSection.locator ( 'button.settings-switch[aria-label="Toggle automatic note renaming"]' ).first ();
  const disableRenamePrev = await disableRenameSwitch.getAttribute ( 'aria-pressed' );
  await disableRenameSwitch.click ();
  const disableRenameNext = await waitForAttributeChange ( disableRenameSwitch, 'aria-pressed', disableRenamePrev );
  await waitForConfigPathValue ( configFilePath, 'notes.disableAutomaticRenaming', ariaToBool ( disableRenameNext ) );

  const inputSection = getSection ( 'Input' );
  await inputSection.waitFor ({ state: 'visible', timeout: 20000 });
  const middleClickSwitch = inputSection.locator ( 'button.settings-switch[aria-label="Toggle middle-click paste on Linux"]' ).first ();
  const middleClickPrev = await middleClickSwitch.getAttribute ( 'aria-pressed' );
  await middleClickSwitch.click ();
  const middleClickNext = await waitForAttributeChange ( middleClickSwitch, 'aria-pressed', middleClickPrev );
  await waitForConfigPathValue ( configFilePath, 'input.disableMiddleClickPaste', ariaToBool ( middleClickNext ) );

  // Validate changed settings remain reflected in UI after panel navigation.
  await ensureActivitybarPanelOpen ( page, 'Explorer', '.sidepanel-pane.explorer.is-active' );
  await openSettingsView ();

  const generalSectionAfter = getSection ( 'General' );
  const editorSectionAfter = getSection ( 'Editor' );
  const notesSectionAfter = getSection ( 'Notes' );
  const inputSectionAfter = getSection ( 'Input' );

  await generalSectionAfter.waitFor ({ state: 'visible', timeout: 20000 });
  await editorSectionAfter.waitFor ({ state: 'visible', timeout: 20000 });
  await notesSectionAfter.waitFor ({ state: 'visible', timeout: 20000 });
  await inputSectionAfter.waitFor ({ state: 'visible', timeout: 20000 });

  assert.equal (
    await generalSectionAfter.locator ( 'button.settings-switch[aria-label="Toggle automatic update checks"]' ).first ().getAttribute ( 'aria-pressed' ),
    autoUpdateNext
  );
  assert.equal (
    await generalSectionAfter.locator ( 'button.settings-switch[aria-label="Toggle use GPU"]' ).first ().getAttribute ( 'aria-pressed' ),
    useGpuNext
  );
  assert.equal ( await ( await getFieldSelect ( editorSectionAfter, 'Line numbers' ) ).inputValue (), lineNumbersNext );
  assert.equal ( await ( await getFieldSelect ( editorSectionAfter, 'Tab size' ) ).inputValue (), tabSizeNext );
  assert.equal (
    await editorSectionAfter.locator ( 'button.settings-switch[aria-label="Toggle autocomplete suggestions"]' ).first ().getAttribute ( 'aria-pressed' ),
    disableSuggestionsNext
  );
  assert.equal (
    await notesSectionAfter.locator ( 'button.settings-switch[aria-label="Toggle automatic note renaming"]' ).first ().getAttribute ( 'aria-pressed' ),
    disableRenameNext
  );
  assert.equal (
    await inputSectionAfter.locator ( 'button.settings-switch[aria-label="Toggle middle-click paste on Linux"]' ).first ().getAttribute ( 'aria-pressed' ),
    middleClickNext
  );
} );
