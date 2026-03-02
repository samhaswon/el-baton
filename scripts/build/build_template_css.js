/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );
const chokidar = require ( 'chokidar' );

const rootPath = path.join ( __dirname, '..', '..' );
const inputPath = path.join ( rootPath, 'src', 'renderer', 'template', 'dist', 'scss', 'notable.scss' );
const outputPath = path.join ( rootPath, 'src', 'renderer', 'template', 'dist', 'css', 'notable.min.css' );
const inputDirPath = path.dirname ( inputPath );

let building = false;
let pending = false;

const getSass = () => {

  try {

    return require ( 'sass' );

  } catch ( error ) {

    console.error ( '[template:css] Missing `sass`. Run `npm install` to install dev dependencies.' );
    throw error;

  }

};

const build = () => {

  if ( building ) {
    pending = true;
    return;
  }

  building = true;

  try {

    const sass = getSass ();
    const result = sass.compile ( inputPath, {
      style: 'compressed',
      loadPaths: [
        rootPath
      ]
    });

    fs.mkdirSync ( path.dirname ( outputPath ), { recursive: true } );
    fs.writeFileSync ( outputPath, result.css, 'utf8' );

    console.log ( `[template:css] Built ${path.relative ( rootPath, outputPath )}` );

  } finally {

    building = false;

    if ( pending ) {
      pending = false;
      build ();
    }

  }

};

const watch = () => {

  build ();

  console.log ( `[template:css] Watching ${path.relative ( rootPath, inputPath )}` );

  chokidar.watch ( path.join ( inputDirPath, '*.scss' ), {
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
