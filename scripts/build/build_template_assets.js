/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );
const chokidar = require ( 'chokidar' );

const rootPath = path.join ( __dirname, '..', '..' );
const templateBasePath = path.join ( rootPath, 'src', 'renderer', 'template', 'base' );
const templateGeneratedPath = path.join ( rootPath, 'src', 'renderer', 'template', 'generated' );
const templateRuntimePath = path.join ( rootPath, 'src', 'renderer', 'template', 'runtime' );
const templateBaseGlobalCSSPath = path.join ( templateBasePath, 'css', 'global' );
const templateRuntimeCSSPath = path.join ( templateRuntimePath, 'css' );
const resourcesIconPath = path.join ( rootPath, 'resources', 'icon' );

const toPosixPath = targetPath => path.relative ( rootPath, targetPath ).split ( path.sep ).join ( '/' );

const copyDirectoryIfExists = ( sourcePath, destinationPath ) => {

  if ( !fs.existsSync ( sourcePath ) ) return;

  fs.mkdirSync ( destinationPath, { recursive: true } );
  fs.cpSync ( sourcePath, destinationPath, {
    recursive: true,
    force: true
  });

};

const copyFileIfExists = ( sourcePath, destinationPath ) => {

  if ( !fs.existsSync ( sourcePath ) ) return;

  fs.mkdirSync ( path.dirname ( destinationPath ), { recursive: true } );
  fs.copyFileSync ( sourcePath, destinationPath );

};

const listFilesRecursive = sourcePath => {

  if ( !fs.existsSync ( sourcePath ) ) return [];

  return fs.readdirSync ( sourcePath, { withFileTypes: true } ).flatMap ( entry => {

    const entryPath = path.join ( sourcePath, entry.name );

    if ( entry.isDirectory () ) return listFilesRecursive ( entryPath );

    return [entryPath];

  }).sort (( a, b ) => a.localeCompare ( b ));

};

const buildGlobalCSS = () => {

  const sourcePaths = listFilesRecursive ( templateBaseGlobalCSSPath ).filter ( sourcePath => sourcePath.endsWith ( '.css' ) );

  if ( !sourcePaths.length ) {
    throw new Error ( `No global CSS sources found in ${toPosixPath ( templateBaseGlobalCSSPath )}` );
  }

  const content = sourcePaths.map ( sourcePath => fs.readFileSync ( sourcePath, 'utf8' ).trimEnd () ).join ( '\n\n' ) + '\n';

  fs.mkdirSync ( templateRuntimeCSSPath, { recursive: true } );
  fs.writeFileSync ( path.join ( templateRuntimeCSSPath, 'notable.css' ), content );

};

let building = false;
let pending = false;

const build = () => {

  if ( building ) {
    pending = true;
    return;
  }

  building = true;

  try {

    fs.rmSync ( templateRuntimePath, { recursive: true, force: true } );

    copyDirectoryIfExists ( path.join ( templateBasePath, 'images' ), path.join ( templateRuntimePath, 'images' ) );
    copyDirectoryIfExists ( path.join ( templateBasePath, 'javascript' ), path.join ( templateRuntimePath, 'javascript' ) );

    buildGlobalCSS ();

    copyDirectoryIfExists ( path.join ( templateGeneratedPath, 'fonts' ), path.join ( templateRuntimePath, 'fonts' ) );
    copyDirectoryIfExists ( path.join ( templateGeneratedPath, 'javascript' ), path.join ( templateRuntimePath, 'javascript' ) );

    copyFileIfExists ( path.join ( resourcesIconPath, 'icon.png' ), path.join ( templateRuntimePath, 'images', 'icon.png' ) );
    copyFileIfExists ( path.join ( resourcesIconPath, 'icon.ico' ), path.join ( templateRuntimePath, 'images', 'icon.ico' ) );

    console.log ( `[template:assets] Built ${toPosixPath ( templateRuntimePath )}` );

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

  console.log ( `[template:assets] Watching ${toPosixPath ( templateBasePath )}` );
  console.log ( `[template:assets] Watching ${toPosixPath ( templateGeneratedPath )}` );
  console.log ( `[template:assets] Watching ${toPosixPath ( resourcesIconPath )}` );

  chokidar.watch ([
    path.join ( templateBaseGlobalCSSPath, '**', '*.css' ),
    path.join ( templateBasePath, 'images', '**', '*' ),
    path.join ( templateBasePath, 'javascript', '**', '*' ),
    path.join ( templateGeneratedPath, '**', '*' ),
    path.join ( resourcesIconPath, 'icon.png' ),
    path.join ( resourcesIconPath, 'icon.ico' )
  ], {
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
