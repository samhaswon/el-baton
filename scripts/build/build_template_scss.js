/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );
const chokidar = require ( 'chokidar' );

const rootPath = path.join ( __dirname, '..', '..' );
const templateSrcPath = path.join ( rootPath, 'src', 'renderer', 'template', 'src' );
const templateBaseScssPath = path.join ( rootPath, 'src', 'renderer', 'template', 'base', 'scss' );
const templateDistScssPath = path.join ( rootPath, 'src', 'renderer', 'template', 'dist', 'scss' );

const variablesOutputPath = path.join ( templateDistScssPath, 'notable.overrides.variables.scss' );
const styleOutputPath = path.join ( templateDistScssPath, 'notable.overrides.style.scss' );
const entryOutputPath = path.join ( templateDistScssPath, 'notable.scss' );

const toPosixPath = targetPath => path.relative ( rootPath, targetPath ).split ( path.sep ).join ( '/' );

const writeFile = ( targetPath, contents ) => {
  fs.mkdirSync ( path.dirname ( targetPath ), { recursive: true } );
  fs.writeFileSync ( targetPath, contents, 'utf8' );
};

const readFileIfExists = targetPath => {

  if ( !fs.existsSync ( targetPath ) ) return '';

  return fs.readFileSync ( targetPath, 'utf8' );

};

const getScssFiles = relativeDir => {

  const absoluteDir = path.join ( templateSrcPath, relativeDir );

  if ( !fs.existsSync ( absoluteDir ) ) return [];

  const found = [];
  const stack = [ absoluteDir ];

  while ( stack.length ) {
    const current = stack.pop ();
    const entries = fs.readdirSync ( current, { withFileTypes: true } )
      .sort ( ( a, b ) => a.name.localeCompare ( b.name ) );

    for ( const entry of entries ) {
      const absolutePath = path.join ( current, entry.name );

      if ( entry.isDirectory () ) {
        stack.push ( absolutePath );
        continue;
      }

      if ( entry.isFile () && absolutePath.endsWith ( '.scss' ) ) {
        found.push ( absolutePath );
      }
    }
  }

  return found.sort ( ( a, b ) => a.localeCompare ( b ) );

};

const isVariableFile = absolutePath => /(^|\/)variables(?:\.[^.]+)?\.scss$/.test ( absolutePath ) || /(^|\/)variables\.(?:before|after)\.scss$/.test ( absolutePath );

const shouldIncludeOverride = ( snapshot, source ) => {

  if ( !source ) return false;
  if ( !snapshot ) return true;

  return !snapshot.includes ( source );

};

const buildVariablesBundle = () => {

  const baseSnapshot = readFileIfExists ( path.join ( templateBaseScssPath, 'notable.variables.scss' ) );

  const files = [
    ...getScssFiles ( 'core' ),
    ...getScssFiles ( 'decorators' ),
    ...getScssFiles ( 'widgets' ),
    ...getScssFiles ( 'windows' )
  ].filter ( isVariableFile );

  const sections = files.map ( absolutePath => {
    const source = fs.readFileSync ( absolutePath, 'utf8' ).trim ();
    if ( !shouldIncludeOverride ( baseSnapshot, source ) ) return '';
    return `/* SOURCE: ${toPosixPath ( absolutePath )} */\n${source}`;
  }).filter ( Boolean );

  return `${sections.join ( '\n\n' )}\n`;

};

const buildStyleBundle = () => {

  const baseSnapshot = readFileIfExists ( path.join ( templateBaseScssPath, 'notable.style.scss' ) );

  const styleFiles = [
    ...getScssFiles ( '.' ).filter ( absolutePath => {
      if ( isVariableFile ( absolutePath ) ) return false;

      const relativePath = path.relative ( templateSrcPath, absolutePath ).split ( path.sep ).join ( '/' );

      if ( relativePath.startsWith ( 'themes/components/' ) ) return true;
      if ( relativePath === 'themes/abstract.scss' ) return true;
      if ( relativePath === 'themes/dark.scss' ) return true;
      if ( relativePath === 'themes/light.scss' ) return true;
      if ( relativePath.startsWith ( 'themes/' ) ) return false;

      return true;
    })
  ];

  const themedFiles = styleFiles.filter ( absolutePath => {
    const relativePath = path.relative ( templateSrcPath, absolutePath ).split ( path.sep ).join ( '/' );
    return relativePath.startsWith ( 'themes/' );
  });

  const regularFiles = styleFiles.filter ( absolutePath => {
    const relativePath = path.relative ( templateSrcPath, absolutePath ).split ( path.sep ).join ( '/' );
    return !relativePath.startsWith ( 'themes/' );
  });

  const orderedFiles = [
    ...regularFiles,
    ...themedFiles.filter ( absolutePath => absolutePath.includes ( `${path.sep}themes${path.sep}components${path.sep}` ) ),
    ...themedFiles.filter ( absolutePath => absolutePath.endsWith ( `${path.sep}themes${path.sep}abstract.scss` ) ),
    ...themedFiles.filter ( absolutePath => absolutePath.endsWith ( `${path.sep}themes${path.sep}dark.scss` ) ),
    ...themedFiles.filter ( absolutePath => absolutePath.endsWith ( `${path.sep}themes${path.sep}light.scss` ) )
  ];

  const sections = orderedFiles.map ( absolutePath => {
    const source = fs.readFileSync ( absolutePath, 'utf8' ).trim ();
    if ( !shouldIncludeOverride ( baseSnapshot, source ) ) return '';
    return `/* SOURCE: ${toPosixPath ( absolutePath )} */\n${source}`;
  }).filter ( Boolean );

  return `${sections.join ( '\n\n' )}\n`;

};

const buildEntryBundle = () => {

  const compatibilityPrelude = [
    "@use 'sass:color';",
    "@use 'sass:list';",
    "@use 'sass:map';",
    "@use 'sass:math';",
    "@use 'sass:meta';",
    "@use 'sass:selector';",
    "@use 'sass:string';",
    '',
    '/* Compatibility helpers for the legacy Svelto snapshot. */',
    '@function lighten ( $color-value, $amount ) {',
    '  @if math.is-unitless( $amount ) {',
    '    $amount: $amount * 1%;',
    '  }',
    '',
    '  @return color.adjust( $color-value, $lightness: $amount );',
    '}',
    '@function darken ( $color-value, $amount ) {',
    '  @if math.is-unitless( $amount ) {',
    '    $amount: $amount * 1%;',
    '  }',
    '',
    '  @return color.adjust( $color-value, $lightness: -$amount );',
    '}',
    '@function transparentize ( $color-value, $amount ) {',
    '  @return color.adjust( $color-value, $alpha: -$amount );',
    '}',
    '@function type-of ( $value ) {',
    '  @return meta.type-of( $value );',
    '}',
    '@function length ( $list-value ) {',
    '  @return list.length( $list-value );',
    '}',
    '@function nth ( $list-value, $index ) {',
    '  @return list.nth( $list-value, $index );',
    '}',
    '@function append ( $list-value, $value, $separator: auto ) {',
    '  @return list.append( $list-value, $value, $separator );',
    '}',
    '@function index ( $list-value, $value ) {',
    '  @return list.index( $list-value, $value );',
    '}',
    '@function map-get ( $map-value, $key ) {',
    '  @return map.get( $map-value, $key );',
    '}',
    '@function map-keys ( $map-value ) {',
    '  @return map.keys( $map-value );',
    '}',
    '@function map-merge ( $map-a, $map-b ) {',
    '  @return map.merge( $map-a, $map-b );',
    '}',
    '@function map-remove ( $map-value, $keys... ) {',
    '  @return map.remove( $map-value, $keys... );',
    '}',
    '@function map-has-key ( $map-value, $key ) {',
    '  @return map.has-key( $map-value, $key );',
    '}',
    '@function abs ( $number ) {',
    '  @return math.abs( $number );',
    '}',
    '@function unit ( $number ) {',
    '  @return math.unit( $number );',
    '}',
    '@function unitless ( $number ) {',
    '  @return math.is-unitless( $number );',
    '}',
    '@function round ( $number ) {',
    '  @return math.round( $number );',
    '}',
    '@function percentage ( $number ) {',
    '  @return math.percentage( $number );',
    '}',
    '@function selector-append ( $selectors... ) {',
    '  @return selector.append( $selectors... );',
    '}',
    '@function selector-parse ( $selector-value ) {',
    '  @return selector.parse( $selector-value );',
    '}',
    '@function selector-nest ( $selectors... ) {',
    '  @return selector.nest( $selectors... );',
    '}',
    '@function selector-unify ( $selector-a, $selector-b ) {',
    '  @return selector.unify( $selector-a, $selector-b );',
    '}',
    '@function quote ( $value ) {',
    '  @return string.quote( $value );',
    '}',
    '@function str-length ( $value ) {',
    '  @return string.length( $value );',
    '}',
    '@function str-index ( $string-value, $substring ) {',
    '  @return string.index( $string-value, $substring );',
    '}',
    '@function str-slice ( $string-value, $start-at, $end-at: null ) {',
    '  @if $end-at == null {',
    '    @return string.slice( $string-value, $start-at );',
    '  }',
    '',
    '  @return string.slice( $string-value, $start-at, $end-at );',
    '}',
    ''
  ].join ( '\n' );

  const sections = [
    'notable.functions.scss',
    'notable.mixins.scss',
    'notable.variables.scss',
    'notable.overrides.variables.scss',
    'notable.style.scss',
    'notable.overrides.style.scss'
  ].map ( fileName => {
    const absolutePath = path.join ( templateDistScssPath, fileName );
    const source = fs.readFileSync ( absolutePath, 'utf8' ).trim ();
    return `/* SOURCE: ${toPosixPath ( absolutePath )} */\n${source}`;
  });

  return `${compatibilityPrelude}\n${sections.join ( '\n\n' )}\n`;

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

    writeFile ( variablesOutputPath, buildVariablesBundle () );
    writeFile ( styleOutputPath, buildStyleBundle () );
    writeFile ( entryOutputPath, buildEntryBundle () );

    console.log ( `[template:scss] Built ${toPosixPath ( variablesOutputPath )}` );
    console.log ( `[template:scss] Built ${toPosixPath ( styleOutputPath )}` );
    console.log ( `[template:scss] Built ${toPosixPath ( entryOutputPath )}` );

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

  console.log ( `[template:scss] Watching ${toPosixPath ( templateSrcPath )}` );

  chokidar.watch ( path.join ( templateSrcPath, '**', '*.scss' ), {
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
