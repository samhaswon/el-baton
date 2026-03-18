
/* IMPORT */

import * as path from 'path';
import {app} from 'electron';
import App from './app';
import Config from '@common/config';

/* MAIN */

const remoteMain = require ( '@electron/remote/main' );

remoteMain.initialize ();

if ( process.env.NODE_ENV === 'development' ) {
  ( global as any ).__static = path.join ( process.cwd (), 'src', 'renderer', 'template', 'runtime' );
} else {
  ( global as any ).__static = path.join ( __dirname, '..', 'renderer' );
}

if ( Config.performance.highPerformanceMode ) {
  app.commandLine.appendSwitch ( 'enable-gpu-rasterization' );
  app.commandLine.appendSwitch ( 'enable-zero-copy' );
  app.commandLine.appendSwitch ( 'num-raster-threads', '4' );
}

new App ();
