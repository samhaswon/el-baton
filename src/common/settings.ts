
/* IMPORT */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import Store from 'electron-store';
import {darkMode} from '@common/electron_util_shim';

/* SETTINGS */

const cwd = os.homedir ();
const settingsName = '.el-baton';
const legacySettingsName = '.notable';

const settingsPath = path.join ( cwd, `${settingsName}.json` );
const legacySettingsPath = path.join ( cwd, `${legacySettingsName}.json` );

if ( !fs.existsSync ( settingsPath ) && fs.existsSync ( legacySettingsPath ) ) {
  fs.copyFileSync ( legacySettingsPath, settingsPath );
}

const Settings = new Store ({
  name: settingsName,
  cwd,
  defaults: {
    cwd: undefined,
    editor: {
      activeTab: undefined,
      editing: true,
      openTabs: [],
      split: true
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
    theme: darkMode.isEnabled ? 'dark' : 'light',
    tutorial: false, // Legacy first-run marker
    openCheatsheetOnStart: false,
    window: {
      sidebar: true,
      zen: false,
      panel: 'info',
      explorerSectionsCollapsed: {},
      explorerTagsCollapsed: {}
    }
  }
});

/* EXPORT */

export default Settings;
