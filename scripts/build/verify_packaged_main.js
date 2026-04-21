/* IMPORT */

const fs = require ( 'fs' );
const path = require ( 'path' );
const asar = require ( '@electron/asar' );

/* HELPERS */

const getArchivePath = appOutDir => {

  const candidates = [
    path.join ( appOutDir, 'resources', 'app.asar' ),
    path.join ( appOutDir, 'Contents', 'Resources', 'app.asar' )
  ];

  for ( let index = 0, l = candidates.length; index < l; index++ ) {
    const archivePath = candidates[index];
    if ( fs.existsSync ( archivePath ) ) return archivePath;
  }

  throw new Error ( `[build:verify-packaged-main] Unable to locate app.asar under "${appOutDir}"` );

};

const normalizeArchivePath = value => value.replace ( /\\/g, '/' );

/* VERIFY PACKAGED MAIN */

function verifyPackagedMain ( appOutDir ) {

  const archivePath = getArchivePath ( appOutDir ),
        packageRaw = asar.extractFile ( archivePath, 'package.json' ).toString ( 'utf8' ),
        packageJSON = JSON.parse ( packageRaw ),
        rawMain = packageJSON.main;

  if ( typeof rawMain !== 'string' || !rawMain.trim () ) {
    throw new Error ( `[build:verify-packaged-main] Missing packaged "main" field in "${archivePath}"` );
  }

  if ( rawMain.includes ( '\\' ) ) {
    throw new Error ( `[build:verify-packaged-main] Packaged "main" must use forward slashes, received "${rawMain}"` );
  }

  const main = normalizeArchivePath ( rawMain.trim () );

  try {
    asar.statFile ( archivePath, main, true );
  } catch ( error ) {
    const message = error instanceof Error ? error.message : String ( error );
    throw new Error ( `[build:verify-packaged-main] Packaged main "${main}" was not found in "${archivePath}": ${message}` );
  }

}

/* EXPORT */

module.exports = verifyPackagedMain;
