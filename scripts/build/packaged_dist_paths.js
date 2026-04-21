/* IMPORT */

const path = require ( 'path' );

/* HELPERS */

const getPackagedDistSnapshotDir = context => {

  const projectDir = path.resolve ( context.packager?.projectDir || process.cwd () ),
        appOutDirName = path.basename ( context.appOutDir );

  return path.join ( projectDir, '.tmp', 'packaged-dist-source', appOutDirName, 'dist' );

};

/* EXPORT */

module.exports = {
  getPackagedDistSnapshotDir
};
