/* IMPORT */

const cp = require ( 'child_process' );
const fs = require ( 'fs' );
const path = require ( 'path' );
const {getPackagedDistSnapshotDir} = require ( './packaged_dist_paths' );

/* HELPERS */

const getSourceDistDir = context => (
  path.join ( path.resolve ( context.packager?.projectDir || process.cwd () ), 'dist' )
);

const hasCompiledDist = distDir => (
  fs.existsSync ( path.join ( distDir, 'main', 'main.js' ) ) &&
  fs.existsSync ( path.join ( distDir, 'renderer', 'index.html' ) )
);

const runNpmScript = ({ projectDir, script }) => {

  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm',
        result = cp.spawnSync ( command, ['run', '-s', script], {
          cwd: projectDir,
          env: {
            ...process.env,
            NODE_ENV: 'production'
          },
          stdio: 'inherit'
        });

  if ( result.status !== 0 ) {
    throw new Error ( `[build:before-pack] Failed to run "${script}" while repairing missing compiled bundles` );
  }

};

const restoreCompiledDistFromSnapshot = ({ sourceDistDir, snapshotDistDir }) => {

  if ( !hasCompiledDist ( snapshotDistDir ) ) return false;

  fs.mkdirSync ( sourceDistDir, { recursive: true } );
  fs.cpSync ( snapshotDistDir, sourceDistDir, {
    force: true,
    recursive: true
  });

  return true;

};

const ensureCompiledDist = ({ projectDir, sourceDistDir, snapshotDistDir }) => {

  const compiledMainPath = path.join ( sourceDistDir, 'main', 'main.js' ),
        compiledRendererPath = path.join ( sourceDistDir, 'renderer', 'index.html' ),
        missingMain = !fs.existsSync ( compiledMainPath ),
        missingRenderer = !fs.existsSync ( compiledRendererPath );

  if ( missingMain || missingRenderer ) {
    const restored = restoreCompiledDistFromSnapshot ({ sourceDistDir, snapshotDistDir });

    if ( restored ) {
      console.warn ( `[build:before-pack] Restored compiled dist from snapshot "${snapshotDistDir}"` );
    }
  }

  if ( !fs.existsSync ( compiledMainPath ) ) {
    console.warn ( `[build:before-pack] Missing "${compiledMainPath}", rebuilding main bundle` );
    runNpmScript ({ projectDir, script: 'bundle:main' });
  }

  if ( !fs.existsSync ( compiledRendererPath ) ) {
    console.warn ( `[build:before-pack] Missing "${compiledRendererPath}", rebuilding renderer bundle` );
    runNpmScript ({ projectDir, script: 'bundle:renderer' });
  }

  if ( !fs.existsSync ( compiledMainPath ) ) {
    throw new Error ( `[build:before-pack] Missing compiled main bundle before packaging: "${compiledMainPath}"` );
  }

  if ( !fs.existsSync ( compiledRendererPath ) ) {
    throw new Error ( `[build:before-pack] Missing compiled renderer bundle before packaging: "${compiledRendererPath}"` );
  }

};

/* BEFORE PACK */

function beforePack ( context ) {

  const projectDir = path.resolve ( context.packager?.projectDir || process.cwd () ),
        sourceDistDir = getSourceDistDir ( context ),
        snapshotDistDir = getPackagedDistSnapshotDir ( context );

  ensureCompiledDist ({ projectDir, sourceDistDir, snapshotDistDir });

  fs.rmSync ( snapshotDistDir, {
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
