/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );
const {execFileSync} = require ( 'child_process' );

const rootPath = path.join ( __dirname, '..', '..' );
const sourceSvgPath = path.join ( rootPath, 'resources', 'icon', 'el_baton_logo.svg' );

const iconDirPath = path.join ( rootPath, 'resources', 'icon' );
const iconPngPath = path.join ( iconDirPath, 'icon.png' );
const faviconPath = path.join ( iconDirPath, 'favicon.png' );
const iconIcoPath = path.join ( iconDirPath, 'icon.ico' );
const iconSmallPath = path.join ( iconDirPath, 'icon_small.png' );

const templateBaseIconPngPath = path.join ( rootPath, 'src', 'renderer', 'template', 'base', 'images', 'icon.png' );
const templateBaseIconIcoPath = path.join ( rootPath, 'src', 'renderer', 'template', 'base', 'images', 'icon.ico' );
const templateStaticIconPngPath = path.join ( rootPath, 'src', 'renderer', 'template', 'src', 'static', 'icon.png' );
const templateStaticIconIcoPath = path.join ( rootPath, 'src', 'renderer', 'template', 'src', 'static', 'icon.ico' );

const themingIconSmallPath = path.join ( rootPath, 'resources', 'theming', 'attachments', 'icon_small.png' );

const oldLogoSources = [
  path.join ( iconDirPath, 'icon.afphoto' )
];

const linuxIconSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];

const hasCommand = command => {
  try {
    execFileSync ( command, ['--version'], { stdio: 'ignore' } );
    return true;
  } catch ( error ) {
    return false;
  }
};

const ensureDirectory = filePath => {
  fs.mkdirSync ( path.dirname ( filePath ), { recursive: true } );
};

const removeIfExists = filePath => {
  if ( fs.existsSync ( filePath ) ) {
    fs.rmSync ( filePath, { force: true } );
  }
};

const renderPng = ( destinationPath, size, inkscapeCommand ) => {
  ensureDirectory ( destinationPath );

  removeIfExists ( destinationPath );

  execFileSync ( inkscapeCommand, [
    sourceSvgPath,
    '--export-type=png',
    '--export-filename',
    destinationPath,
    '--export-width',
    String ( size ),
    '--export-height',
    String ( size )
  ], { stdio: 'inherit' } );

  if ( !fs.existsSync ( destinationPath ) ) {
    // Fallback for CLI variants that prefer short output arguments.
    execFileSync ( inkscapeCommand, [
      sourceSvgPath,
      '-o',
      destinationPath,
      '-w',
      String ( size ),
      '-h',
      String ( size )
    ], { stdio: 'inherit' } );
  }

  if ( !fs.existsSync ( destinationPath ) ) {
    throw new Error ( `Inkscape did not produce expected file: ${destinationPath}` );
  }
};

const copyFile = ( sourcePath, destinationPath ) => {
  ensureDirectory ( destinationPath );
  fs.copyFileSync ( sourcePath, destinationPath );
};

const ensureFile = filePath => {
  if ( !fs.existsSync ( filePath ) ) {
    throw new Error ( `Missing required file: ${path.relative ( rootPath, filePath )}` );
  }
};

const getImageMagickCommand = () => {
  if ( hasCommand ( 'magick' ) ) return 'magick';
  if ( hasCommand ( 'convert' ) ) return 'convert';
  throw new Error ( 'Required command not found: magick or convert' );
};

const getInkscapeCommand = () => {
  if ( process.platform === 'win32' && hasCommand ( 'inkscape.com' ) ) return 'inkscape.com';
  if ( hasCommand ( 'inkscape' ) ) return 'inkscape';
  throw new Error ( 'Required command not found: inkscape' );
};

const main = () => {

  if ( !fs.existsSync ( sourceSvgPath ) ) {
    throw new Error ( `Missing source SVG: ${path.relative ( rootPath, sourceSvgPath )}` );
  }

  if ( process.env.EL_BATON_SKIP_ICON_REGEN === '1' ) {
    ensureFile ( iconPngPath );
    ensureFile ( iconIcoPath );
    ensureFile ( faviconPath );
    ensureFile ( iconSmallPath );

    for ( const size of linuxIconSizes ) {
      ensureFile ( path.join ( iconDirPath, `${size}x${size}.png` ) );
    }

    copyFile ( iconPngPath, templateBaseIconPngPath );
    copyFile ( iconIcoPath, templateBaseIconIcoPath );
    copyFile ( iconPngPath, templateStaticIconPngPath );
    copyFile ( iconIcoPath, templateStaticIconIcoPath );
    copyFile ( iconSmallPath, themingIconSmallPath );

    console.log ( '[icon] Skipped icon regeneration (EL_BATON_SKIP_ICON_REGEN=1), reused existing icon assets' );
    return;
  }

  const inkscapeCommand = getInkscapeCommand ();
  const imageMagickCommand = getImageMagickCommand ();

  for ( const size of linuxIconSizes ) {
    removeIfExists ( path.join ( iconDirPath, `${size}x${size}.png` ) );
  }

  removeIfExists ( iconPngPath );
  removeIfExists ( faviconPath );
  removeIfExists ( iconIcoPath );
  removeIfExists ( iconSmallPath );

  renderPng ( iconPngPath, 1024, inkscapeCommand );
  renderPng ( faviconPath, 64, inkscapeCommand );
  renderPng ( iconSmallPath, 64, inkscapeCommand );

  for ( const size of linuxIconSizes ) {
    const sizePath = path.join ( iconDirPath, `${size}x${size}.png` );

    if ( fs.existsSync ( sizePath ) ) continue;

    renderPng ( sizePath, size, inkscapeCommand );
  }

  execFileSync (
    imageMagickCommand,
    [iconPngPath, '-define', 'icon:auto-resize=256,128,64,48,32,24,16', iconIcoPath],
    { stdio: 'inherit' }
  );

  copyFile ( iconPngPath, templateBaseIconPngPath );
  copyFile ( iconIcoPath, templateBaseIconIcoPath );
  copyFile ( iconPngPath, templateStaticIconPngPath );
  copyFile ( iconIcoPath, templateStaticIconIcoPath );

  copyFile ( iconSmallPath, themingIconSmallPath );

  for ( const oldLogoSourcePath of oldLogoSources ) {
    removeIfExists ( oldLogoSourcePath );
  }

  console.log ( `[icon] Generated icons from ${path.relative ( rootPath, sourceSvgPath )}` );
};

main ();
