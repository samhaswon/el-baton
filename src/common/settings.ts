
/* IMPORT */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {darkMode} from '@common/electron_util_shim';

/* TYPES */

type SettingsShape = {
  cwd?: string;
  editor: {
    activeTab?: string;
    editing: boolean;
    openTabs: string[];
    split: boolean;
  };
  monaco: {
    editorOptions: {
      lineNumbers: string;
      minimap: {
        enabled: boolean;
      };
      wordWrap: string;
    };
  };
  sorting: {
    by: string;
    type: string;
  };
  theme: string;
  tutorial: boolean;
  openCheatsheetOnStart: boolean;
  window: {
    sidebar: boolean;
    zen: boolean;
    panel: string;
    explorerSectionsCollapsed: Record<string, unknown>;
    explorerTagsCollapsed: Record<string, unknown>;
  };
};

type SettingsStore<T extends Record<string, any>> = {
  get: ( key: string, defaultValue?: any ) => any;
  set: {
    ( key: string, value?: any ): void;
    ( object: Partial<T> ): void;
  };
};

const Store = require ( 'electron-store' ).default as new <T extends Record<string, any>> ( options?: any ) => SettingsStore<T>;

/* SETTINGS */

const cwd = os.homedir ();
const settingsName = '.el-baton';
const legacySettingsName = '.notable';

const settingsPath = path.join ( cwd, `${settingsName}.json` );
const legacySettingsPath = path.join ( cwd, `${legacySettingsName}.json` );

if ( !fs.existsSync ( settingsPath ) && fs.existsSync ( legacySettingsPath ) ) {
  fs.copyFileSync ( legacySettingsPath, settingsPath );
}

const Settings = new Store<SettingsShape> ({
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
