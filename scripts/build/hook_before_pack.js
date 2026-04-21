/* IMPORT */

const fs = require ( 'fs' );
const path = require ( 'path' );
const {getPackagedDistSnapshotDir} = require ( './packaged_dist_paths' );

/* HELPERS */

const getSourceDistDir = context => (
  path.join ( path.resolve ( context.packager?.projectDir || process.cwd () ), 'dist' )
);

/* BEFORE PACK */

function beforePack ( context ) {

  const sourceDistDir = getSourceDistDir ( context ),
        compiledMainPath = path.join ( sourceDistDir, 'main', 'main.js' ),
        snapshotDistDir = getPackagedDistSnapshotDir ( context );

  if ( !fs.existsSync ( compiledMainPath ) ) {
    throw new Error ( `[build:before-pack] Missing compiled main bundle before packaging: "${compiledMainPath}"` );
  }

  fs.rmSync ( path.dirname ( snapshotDistDir ), {
    force: true,
    recursive: true
  });

  fs.mkdirSync ( path.dirname ( snapshotDistDir ), { recursive: true } );
  fs.cpSync ( sourceDistDir, snapshotDistDir, {
    force: true,
    recursive: true
  });

}

/* EXPORT */

module.exports = beforePack;
