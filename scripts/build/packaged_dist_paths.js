/* IMPORT */

const path = require('path')

/* HELPERS */

const getCompiledDistSnapshotDir = projectDir => (
  path.join(path.resolve(projectDir), '.tmp', 'compiled-dist-source', 'dist')
)

const getPackagedDistSnapshotDir = context => {
  const projectDir = path.resolve(context.packager?.projectDir || process.cwd())
  const appOutDirName = path.basename(context.appOutDir)

  return path.join(projectDir, '.tmp', 'packaged-dist-source', appOutDirName, 'dist')
}

/* EXPORT */

module.exports = {
  getCompiledDistSnapshotDir,
  getPackagedDistSnapshotDir
}
