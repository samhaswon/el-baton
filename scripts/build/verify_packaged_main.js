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

const normalizeArchivePath = value => value.replace ( /\\/g, '/' ).replace ( /^\/+/, '' );

const getArchiveEntries = archivePath => new Set (
  asar.listPackage ( archivePath, { isPack: false } ).map ( normalizeArchivePath )
);

const hasArchiveEntry = ({ entries, filePath }) => entries.has ( normalizeArchivePath ( filePath ) );

const assertArchiveEntry = ({ archivePath, entries, filePath, label = filePath, fallbackPaths = [] }) => {

  const normalized = normalizeArchivePath ( filePath );

  if ( entries.has ( normalized ) ) return;

  for ( let index = 0, l = fallbackPaths.length; index < l; index++ ) {
    if ( fs.existsSync ( fallbackPaths[index] ) ) return;
  }

  const basename = path.basename ( normalized ),
        similarEntries = Array.from ( entries ).filter ( entry => entry.endsWith ( basename ) ).slice ( 0, 8 ),
        similarSuffix = similarEntries.length ? ` Similar archive entries: ${similarEntries.join ( ', ' ) }.` : '';

  throw new Error ( `[build:verify-packaged-main] Missing ${label} in "${archivePath}".${similarSuffix}` );

};

/* VERIFY PACKAGED MAIN */

function verifyPackagedMain ( contextOrAppOutDir ) {

  const archivePath = getArchivePath ( contextOrAppOutDir ),
        resourcesDir = path.dirname ( archivePath ),
        entries = getArchiveEntries ( archivePath ),
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

  assertArchiveEntry ({
    archivePath,
    entries,
    filePath: main,
    label: `packaged main "${main}"`
  });

  if ( main === 'main.js' ) {
    assertArchiveEntry ({
      archivePath,
      entries,
      filePath: 'dist/main/main.js',
      label: 'compiled main bundle "dist/main/main.js"',
      fallbackPaths: [
        path.join ( resourcesDir, 'app.asar.unpacked', 'dist', 'main', 'main.js' ),
        path.join ( resourcesDir, 'dist', 'main', 'main.js' )
      ]
    });
  }

}

/* EXPORT */

module.exports = verifyPackagedMain;
module.exports.getArchivePath = getArchivePath;
module.exports.getArchiveEntries = getArchiveEntries;
module.exports.hasArchiveEntry = hasArchiveEntry;
module.exports.normalizeArchivePath = normalizeArchivePath;
