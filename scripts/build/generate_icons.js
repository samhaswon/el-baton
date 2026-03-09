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

const ensureCommand = command => {
  if ( !hasCommand ( command ) ) {
    throw new Error ( `Required command not found: ${command}` );
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

const renderPng = ( destinationPath, size ) => {
  ensureDirectory ( destinationPath );

  execFileSync ( 'inkscape', [
    sourceSvgPath,
    '--export-type=png',
    `--export-filename=${destinationPath}`,
    `--export-width=${size}`,
    `--export-height=${size}`
  ], { stdio: 'inherit' } );
};

const copyFile = ( sourcePath, destinationPath ) => {
  ensureDirectory ( destinationPath );
  fs.copyFileSync ( sourcePath, destinationPath );
};

const getImageMagickCommand = () => {
  if ( hasCommand ( 'magick' ) ) return 'magick';
  if ( hasCommand ( 'convert' ) ) return 'convert';
  throw new Error ( 'Required command not found: magick or convert' );
};

const main = () => {

  if ( !fs.existsSync ( sourceSvgPath ) ) {
    throw new Error ( `Missing source SVG: ${path.relative ( rootPath, sourceSvgPath )}` );
  }

  ensureCommand ( 'inkscape' );
  const imageMagickCommand = getImageMagickCommand ();

  for ( const size of linuxIconSizes ) {
    removeIfExists ( path.join ( iconDirPath, `${size}x${size}.png` ) );
  }

  removeIfExists ( iconPngPath );
  removeIfExists ( faviconPath );
  removeIfExists ( iconIcoPath );
  removeIfExists ( iconSmallPath );

  renderPng ( iconPngPath, 1024 );
  renderPng ( faviconPath, 64 );
  renderPng ( iconSmallPath, 64 );

  const icoSourcePngPaths = [16, 24, 32, 48, 64, 128, 256].map ( size => {
    const filePath = path.join ( iconDirPath, `${size}x${size}.png` );
    renderPng ( filePath, size );
    return filePath;
  });

  for ( const size of linuxIconSizes ) {
    const sizePath = path.join ( iconDirPath, `${size}x${size}.png` );

    if ( fs.existsSync ( sizePath ) ) continue;

    renderPng ( sizePath, size );
  }

  execFileSync ( imageMagickCommand, [...icoSourcePngPaths, iconIcoPath], { stdio: 'inherit' } );

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
