/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );
const chokidar = require ( 'chokidar' );

const rootPath = path.join ( __dirname, '..', '..' );
const sourcePath = path.join ( rootPath, 'src', 'renderer', 'template', 'base' );
const destinationPath = path.join ( rootPath, 'src', 'renderer', 'template', 'dist' );

let copying = false;
let pending = false;

const build = () => {

  if ( copying ) {
    pending = true;
    return;
  }

  copying = true;

  try {

    fs.mkdirSync ( destinationPath, { recursive: true } );
    fs.cpSync ( sourcePath, destinationPath, {
      recursive: true,
      force: true
    });

    console.log ( `[template:seed] Seeded ${path.relative ( rootPath, destinationPath )}` );

  } finally {

    copying = false;

    if ( pending ) {
      pending = false;
      build ();
    }

  }

};

const watch = () => {

  build ();

  console.log ( `[template:seed] Watching ${path.relative ( rootPath, sourcePath )}` );

  chokidar.watch ( path.join ( sourcePath, '**', '*' ), {
    ignoreInitial: true
  }).on ( 'all', () => {
    build ();
  });

};

if ( process.argv.includes ( '--watch' ) ) {
  watch ();
} else {
  build ();
}
