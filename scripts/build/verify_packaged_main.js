/* IMPORT */

const fs = require ( 'fs' );
const path = require ( 'path' );
const asar = require ( '@electron/asar' );

/* HELPERS */

const getArchivePath = contextOrAppOutDir => {

  const appOutDir = typeof contextOrAppOutDir === 'string' ? contextOrAppOutDir : contextOrAppOutDir.appOutDir,
        resourcesDir = typeof contextOrAppOutDir === 'string' ? null : contextOrAppOutDir.packager.getResourcesDir ( appOutDir ),
        candidates = [
          resourcesDir ? path.join ( resourcesDir, 'app.asar' ) : null,
          path.join ( appOutDir, 'resources', 'app.asar' ),
          path.join ( appOutDir, 'Contents', 'Resources', 'app.asar' )
        ].filter ( Boolean );

  for ( let index = 0, l = candidates.length; index < l; index++ ) {
    const archivePath = candidates[index];
    if ( fs.existsSync ( archivePath ) ) return archivePath;
  }

  throw new Error ( `[build:verify-packaged-main] Unable to locate app.asar under "${appOutDir}"` );

};

const normalizeArchivePath = value => value.replace ( /\\/g, '/' );

const assertArchiveEntry = ( archivePath, filePath, label = filePath ) => {

  try {
    asar.statFile ( archivePath, filePath, true );
  } catch ( error ) {
    const message = error instanceof Error ? error.message : String ( error );
    throw new Error ( `[build:verify-packaged-main] Missing ${label} in "${archivePath}": ${message}` );
  }

};

/* VERIFY PACKAGED MAIN */

function verifyPackagedMain ( contextOrAppOutDir ) {

  const archivePath = getArchivePath ( contextOrAppOutDir ),
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

  assertArchiveEntry ( archivePath, main, `packaged main "${main}"` );

  if ( main === 'main.js' ) {
    assertArchiveEntry ( archivePath, 'dist/main/main.js', 'compiled main bundle "dist/main/main.js"' );
  }

}

/* EXPORT */

module.exports = verifyPackagedMain;
