/* IMPORT */

import chokidar from 'chokidar';
import type {ChokidarOptions, FSWatcher} from 'chokidar';

/* TYPES */

type EventHandlers = {
  add?: ( filePath: string ) => unknown;
  change?: ( filePath: string ) => unknown;
  rename?: ( previousFilePath: string, filePath: string ) => unknown;
  unlink?: ( filePath: string ) => unknown;
};

/* WATCHER */

const RENAME_WINDOW = 175;

const watcher = ( watchPath: string, options: ChokidarOptions = {}, handlers: EventHandlers = {} ): FSWatcher => {

  const pendingUnlinks = new Map<string, NodeJS.Timeout> ();

  const flushUnlink = ( filePath: string ) => {
    const timeout = pendingUnlinks.get ( filePath );
    if ( !timeout ) return;
    clearTimeout ( timeout );
    pendingUnlinks.delete ( filePath );
    handlers.unlink?.( filePath );
  };

  const listener = chokidar.watch ( watchPath, {
    ...options,
    ignoreInitial: true
  });

  listener.on ( 'add', filePath => {
    const previousFilePath = pendingUnlinks.keys ().next ().value as string | undefined;
    if ( previousFilePath ) {
      const timeout = pendingUnlinks.get ( previousFilePath );
      if ( timeout ) clearTimeout ( timeout );
      pendingUnlinks.delete ( previousFilePath );
      handlers.rename?.( previousFilePath, filePath );
      return;
    }
    handlers.add?.( filePath );
  });

  listener.on ( 'change', filePath => {
    handlers.change?.( filePath );
  });

  listener.on ( 'unlink', filePath => {
    const timeout = setTimeout ( () => flushUnlink ( filePath ), RENAME_WINDOW );
    pendingUnlinks.set ( filePath, timeout );
  });

  listener.on ( 'ready', () => {
    pendingUnlinks.forEach ( ( timeout, filePath ) => {
      clearTimeout ( timeout );
      pendingUnlinks.delete ( filePath );
      handlers.unlink?.( filePath );
    });
  });

  return listener;

};

/* EXPORT */

export default watcher;
