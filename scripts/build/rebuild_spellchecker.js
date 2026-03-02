'use strict';

const {spawnSync} = require ( 'child_process' );
const path = require ( 'path' );

const projectRoot = path.resolve ( __dirname, '..', '..' );
const electronVersion = require ( path.join ( projectRoot, 'node_modules', 'electron', 'package.json' ) ).version;
const rebuildBin = path.join ( projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild' );

const result = spawnSync (
  rebuildBin,
  ['-f', '-o', 'spellchecker', '-v', electronVersion],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || '/tmp/.npm'
    }
  }
);

process.exit ( result.status || 0 );
