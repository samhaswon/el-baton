/* IMPORT */

const fs = require ( 'fs' );
const path = require ( 'path' );

/* HELPERS */

const getResourcesDir = context => context.packager.getResourcesDir ( context.appOutDir );

const getSourceCandidates = context => {

  const packagerInfo = context.packager.info || {},
        projectDir = context.packager.projectDir,
        appDir = packagerInfo.appDir,
        outDir = context.outDir,
        appOutDir = context.appOutDir;

  return [
    path.join ( process.cwd (), 'dist' ),
    projectDir ? path.join ( projectDir, 'dist' ) : '',
    appDir ? path.join ( appDir, 'dist' ) : '',
    outDir ? path.resolve ( outDir, '..', 'dist' ) : '',
    appOutDir ? path.resolve ( appOutDir, '..', '..', 'dist' ) : ''
  ].filter ( Boolean ).filter ((candidate, index, list) => list.indexOf ( candidate ) === index );

};

/* COPY PACKAGED DIST */

function copyPackagedDist ( context ) {

  const sourceCandidates = getSourceCandidates ( context ),
        sourceDir = sourceCandidates.find ( candidate => fs.existsSync ( candidate ) ),
        resourcesDir = getResourcesDir ( context ),
        destinationDir = path.join ( resourcesDir, 'dist' );

  if ( !sourceDir ) {
    throw new Error ( `[build:copy-packaged-dist] Missing source dist directory. Tried:\n${sourceCandidates.join ( '\n' )}` );
  }

  fs.mkdirSync ( resourcesDir, { recursive: true } );
  fs.cpSync ( sourceDir, destinationDir, { recursive: true, force: true } );

}

/* EXPORT */

module.exports = copyPackagedDist;
