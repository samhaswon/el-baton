/* IMPORT */

const fs = require ( 'fs' );
const path = require ( 'path' );

/* HELPERS */

const getResourcesDir = context => context.packager.getResourcesDir ( context.appOutDir );

/* COPY PACKAGED DIST */

function copyPackagedDist ( context ) {

  const sourceDir = path.join ( process.cwd (), 'dist' ),
        resourcesDir = getResourcesDir ( context ),
        destinationDir = path.join ( resourcesDir, 'dist' );

  if ( !fs.existsSync ( sourceDir ) ) {
    throw new Error ( `[build:copy-packaged-dist] Missing source dist directory at "${sourceDir}"` );
  }

  fs.mkdirSync ( resourcesDir, { recursive: true } );
  fs.cpSync ( sourceDir, destinationDir, { recursive: true, force: true } );

}

/* EXPORT */

module.exports = copyPackagedDist;
