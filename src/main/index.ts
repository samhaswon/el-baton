
/* IMPORT */

import * as path from 'path';
import App from './app';

/* MAIN */

const remoteMain = require ( '@electron/remote/main' );

remoteMain.initialize ();

if ( process.env.NODE_ENV === 'development' ) {
  ( global as any ).__static = path.join ( process.cwd (), 'src', 'renderer', 'template', 'dist' );
} else {
  ( global as any ).__static = path.join ( __dirname, '..', 'renderer' );
}

new App ();
