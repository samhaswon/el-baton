
/* LEGACY ELECTRON COMPAT */

try {
  const electron = require ( 'electron' );
  if ( !electron.remote ) {
    electron.remote = require ( '@electron/remote' );
  }
} catch ( error ) {}

try {
    const path = require ( 'path' );
    if ( !( globalThis as any ).__static ) {
      if ( process.env.NODE_ENV === 'development' ) {
        ( globalThis as any ).__static = path.join ( process.cwd (), 'src', 'renderer', 'template', 'runtime' );
      } else {
        ( globalThis as any ).__static = __dirname;
      }
  }
} catch ( error ) {}

/* HELPERS */

const showBootstrapError = ( error: unknown ) => {

  console.error ( '[renderer] bootstrap failed:', error );

  const app = document.getElementsByClassName ( 'app' )[0];

  if ( !app ) return;

  const message = ( error && ( error as any ).stack ) || String ( error );

  app.innerHTML = `<pre style="padding:16px;white-space:pre-wrap;color:#b00020;">${message}</pre>`;

};

/* RENDERER */

const bootstrap = async () => {

  const {default: debugging} = await import ( './debugging' );
  const {default: render} = await import ( './render' );

  await debugging ();
  await render ();

};

bootstrap ().catch ( showBootstrapError );

/* HOT MODULE REPLACEMENT */

const hotModule = module as NodeModule & {
  hot?: {
    accept: ( dependency: string, callback: () => void ) => void;
  };
};

if ( hotModule.hot ) {

  hotModule.hot.accept ( './render', () => {
    require ( './render' ).default ();
  });

}
