
/* IMPORT */

import {ipcRenderer as ipc, shell} from 'electron';
import Dialog from 'electron-dialog';
import * as fs from 'fs';
import * as os from 'os';
import {Container, autosuspend} from 'overstated';
import * as path from 'path';
import * as pify from 'pify';
import Config from '@common/config';
import Settings from '@common/settings';
import File from '@renderer/utils/file';

/* CWD */

const remote = require ( '@electron/remote' );

class CWD extends Container<CWDState, CWDCTX> {

  /* CONSTRUCTOR */

  constructor () {

    super ();

    autosuspend ( this );

  }

  /* API */

  get = () => {

    return Config.cwd;

  }

  set = async ( folderPath: string ) => {

    if ( Config.cwd === folderPath ) return Dialog.alert ( 'This is already the current data directory' );

    try {

      const hadTutorial = !!Settings.get ( 'tutorial' );

      await pify ( fs.mkdir )( folderPath, { recursive: true } );

      await pify ( fs.access )( folderPath, fs.constants.F_OK );

      Settings.set ( 'cwd', folderPath );

      const notesPath = Config.notes.path,
            hadNotes = ( notesPath && await File.exists ( notesPath ) );

      if ( !hadTutorial && !hadNotes ) {

        Settings.set ( 'tutorial', true );
        Settings.set ( 'openCheatsheetOnStart', true );

      }

      ipc.send ( 'cwd-changed' );

    } catch ( e ) {

      Dialog.alert ( `Couldn't access path: "${folderPath}"` );
      Dialog.alert ( e.message );

    }

  }

  select = () => {

    const folderPath = this.dialog ();

    if ( !folderPath ) return;

    return this.set ( folderPath );

  }

  selectDefault = () => {

    const folderPath = path.join ( os.homedir (), '.el-baton' );

    return this.set ( folderPath );

  }

  openInApp = () => {

    const cwd = this.get ();

    if ( !cwd ) return Dialog.alert ( 'No data directory set' );

    if (( shell as any ).openPath ) {
      ( shell as any ).openPath ( cwd );
    } else {
      ( shell as any ).openItem ( cwd );
    }

  }

  dialog = (): string | undefined => {

    const cwd = Config.cwd,
          defaultPath = cwd ? path.dirname ( cwd ) : os.homedir ();

    const folderPaths = remote.dialog.showOpenDialogSync ({
      title: 'Select Data Directory',
      buttonLabel: 'Select',
      properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'],
      defaultPath
    });

    if ( !folderPaths || !folderPaths.length ) return;

    return folderPaths[0];

  }

}

/* EXPORT */

export default CWD as unknown as ICWD;
