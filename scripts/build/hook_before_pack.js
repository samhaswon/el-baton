/* IMPORT */

const cp = require ( 'child_process' );
const fs = require ( 'fs' );
const path = require ( 'path' );
const {getCompiledDistSnapshotDir, getPackagedDistSnapshotDir} = require ( './packaged_dist_paths' );

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

const restoreCompiledDistFromSnapshot = ({ sourceDistDir, snapshotDistDirs }) => {

  for ( let index = 0, l = snapshotDistDirs.length; index < l; index++ ) {
    const snapshotDistDir = snapshotDistDirs[index];

    if ( !hasCompiledDist ( snapshotDistDir ) ) continue;

    fs.mkdirSync ( sourceDistDir, { recursive: true } );
    fs.cpSync ( snapshotDistDir, sourceDistDir, {
      force: true,
      recursive: true
    });

    return snapshotDistDir;
  }

  return '';

};

const ensureCompiledDist = ({ projectDir, sourceDistDir, snapshotDistDir, compiledSnapshotDistDir }) => {

  const compiledMainPath = path.join ( sourceDistDir, 'main', 'main.js' ),
        compiledRendererPath = path.join ( sourceDistDir, 'renderer', 'index.html' ),
        missingMain = !fs.existsSync ( compiledMainPath ),
        missingRenderer = !fs.existsSync ( compiledRendererPath );

  if ( missingMain || missingRenderer ) {
    const restoredFrom = restoreCompiledDistFromSnapshot ({
      sourceDistDir,
      snapshotDistDirs: [ snapshotDistDir, compiledSnapshotDistDir ]
    });

    if ( restoredFrom ) {
      console.warn ( `[build:before-pack] Restored compiled dist from snapshot "${restoredFrom}"` );
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
        snapshotDistDir = getPackagedDistSnapshotDir ( context ),
        compiledSnapshotDistDir = getCompiledDistSnapshotDir ( projectDir );

  ensureCompiledDist ({ projectDir, sourceDistDir, snapshotDistDir, compiledSnapshotDistDir });

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
