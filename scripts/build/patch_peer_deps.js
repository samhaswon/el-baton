/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );

const rootPath = path.join ( __dirname, '..', '..' );

const patchTargets = [
  {
    label: 'unstated',
    packagePath: path.join ( rootPath, 'node_modules', 'unstated', 'package.json' ),
    peerName: 'react'
  },
  {
    label: 'create-react-context',
    packagePath: path.join ( rootPath, 'node_modules', 'create-react-context', 'package.json' ),
    peerName: 'react'
  }
];

const extendReactPeerRange = value => {

  if ( typeof value !== 'string' || !value.trim () ) return '^18.0.0';

  if ( /\^18(?:\.0\.0)?/.test ( value ) ) return value;

  return `${value} || ^18.0.0`;

};

const patchPeerRange = ({ label, packagePath, peerName }) => {

  if ( !fs.existsSync ( packagePath ) ) {
    console.warn ( `[build:patch-peers] Skipping ${label}, package not found` );
    return;
  }

  const raw = fs.readFileSync ( packagePath, 'utf8' );
  const parsed = JSON.parse ( raw );

  parsed.peerDependencies = parsed.peerDependencies || {};

  const next = extendReactPeerRange ( parsed.peerDependencies[peerName] );

  if ( parsed.peerDependencies[peerName] === next ) {
    console.log ( `[build:patch-peers] ${label} already compatible` );
    return;
  }

  parsed.peerDependencies[peerName] = next;
  fs.writeFileSync ( packagePath, `${JSON.stringify ( parsed, null, 2 )}\n`, 'utf8' );

  console.log ( `[build:patch-peers] Patched ${label} peer ${peerName}: ${next}` );

};

const run = () => {
  patchTargets.forEach ( patchPeerRange );
};

run ();

