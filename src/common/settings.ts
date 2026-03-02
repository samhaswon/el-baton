
/* IMPORT */

import * as os from 'os';
import Store from 'electron-store';
import {darkMode} from '@common/electron_util_shim';

/* SETTINGS */

const Settings = new Store ({
  name: '.notable',
  cwd: os.homedir (),
  defaults: {
    cwd: undefined,
    editor: {
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
    tutorial: false, // Did we import the tutorial yet?
    window: {
      sidebar: true,
      zen: false
    }
  }
});

/* EXPORT */

export default Settings;
