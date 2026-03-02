/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );

const cliPath = path.join ( __dirname, '..', '..', 'node_modules', 'pacco', 'src', 'cli.js' );
const gulpIfPath = path.join ( __dirname, '..', '..', 'node_modules', 'gulp-if', 'index.js' );
const paccoScssTaskPath = path.join ( __dirname, '..', '..', 'node_modules', 'pacco', 'src', 'tasks', 'build', 'css', 'parts', 'scss.js' );
const nodeModulesPath = path.join ( __dirname, '..', '..', 'node_modules' );
const notableScssPaths = [
  path.join ( __dirname, '..', '..', 'src', 'renderer', 'template', 'dist', 'scss', 'notable.scss' ),
  path.join ( __dirname, '..', '..', 'src', 'renderer', 'template', 'dist', 'scss', 'notable.style.scss' )
];
const sveltoScssPaths = [
  path.join ( nodeModulesPath, 'svelto', 'src', 'core', 'layout', 'directions', 'default.scss' ),
  path.join ( nodeModulesPath, 'svelto', 'src', 'widgets', 'layout_resizable', 'directions', 'default.scss' ),
  path.join ( nodeModulesPath, 'svelto', 'src', 'widgets', 'icons', 'corner', 'directions', 'default.scss' ),
  path.join ( nodeModulesPath, 'svelto', 'src', 'widgets', 'popover', 'affixed', 'affixed.scss' ),
  path.join ( nodeModulesPath, 'svelto', 'src', 'widgets', 'textarea', 'autogrow', 'autogrow.scss' ),
  path.join ( nodeModulesPath, 'svelto', 'src', 'widgets', 'textarea', 'disabled', 'disabled.scss' ),
  path.join ( nodeModulesPath, 'svelto', 'src', 'decorators', 'raisable', 'mixins.scss' )
];

const OLD = "const command = app.command ( task.displayName, task.description ).action ( task ).visible ( !hidden );";
const NEW = [
  "const command = app.command ( task.displayName, task.description ).action ( task );",
  "    if ( command.visible ) {",
  "      command.visible ( !hidden );",
  "    } else if ( hidden && command.hide ) {",
  "      command.hide ();",
  "    }"
].join ( '\n' );

const patchPaccoCli = () => {

  if ( !fs.existsSync ( cliPath ) ) {
    console.log ( '[postinstall] pacco not found, skipping patch' );
    return;
  }

  const source = fs.readFileSync ( cliPath, 'utf8' );

  if ( source.includes ( NEW ) ) {
    console.log ( '[postinstall] pacco cli already patched' );
    return;
  }

  if ( !source.includes ( OLD ) ) {
    console.warn ( '[postinstall] pacco cli patch pattern not found, skipping' );
    return;
  }

  const patched = source.replace ( OLD, NEW );

  fs.writeFileSync ( cliPath, patched, 'utf8' );

  console.log ( '[postinstall] patched pacco cli for caporal compatibility' );

};

const patchGulpIf = () => {

  if ( !fs.existsSync ( gulpIfPath ) ) {
    console.log ( '[postinstall] gulp-if not found, skipping patch' );
    return;
  }

  const source = fs.readFileSync ( gulpIfPath, 'utf8' );

  const marker = "if (condition && typeof trueChild === 'function')";

  if ( source.includes ( marker ) ) {
    console.log ( '[postinstall] gulp-if already patched' );
    return;
  }

  const target = "module.exports = function (condition, trueChild, falseChild, minimatchOptions) {";
  const inject = [
    "module.exports = function (condition, trueChild, falseChild, minimatchOptions) {",
    "\tif (typeof condition === 'boolean') {",
    "\t\tif (condition && typeof trueChild === 'function') {",
    "\t\t\ttrueChild = trueChild();",
    "\t\t}",
    "\t\tif (!condition && typeof falseChild === 'function') {",
    "\t\t\tfalseChild = falseChild();",
    "\t\t}",
    "\t} else {",
    "\t\tif (typeof trueChild === 'function') {",
    "\t\t\ttrueChild = trueChild();",
    "\t\t}",
    "\t\tif (typeof falseChild === 'function') {",
    "\t\t\tfalseChild = falseChild();",
    "\t\t}",
    "\t}"
  ].join ( '\n' );

  if ( !source.includes ( target ) ) {
    console.warn ( '[postinstall] gulp-if patch pattern not found, skipping' );
    return;
  }

  const patched = source.replace (
    /module\.exports = function \(condition, trueChild, falseChild, minimatchOptions\) \{[\s\S]*?\tif \(!trueChild\) \{/,
    `${inject}\n\tif (!trueChild) {`
  );

  if ( patched === source ) {
    console.warn ( '[postinstall] gulp-if patch replacement failed, skipping' );
    return;
  }

  fs.writeFileSync ( gulpIfPath, patched, 'utf8' );

  console.log ( '[postinstall] patched gulp-if thunk compatibility' );

};

const patchPaccoScssTask = () => {

  if ( !fs.existsSync ( paccoScssTaskPath ) ) {
    console.log ( '[postinstall] pacco scss task not found, skipping patch' );
    return;
  }

  let source = fs.readFileSync ( paccoScssTaskPath, 'utf8' );

  if ( !source.includes ( "through2 = require ( 'through2' )" ) ) {
    source = source.replace (
      "rename = require ( 'gulp-rename' ),",
      "rename = require ( 'gulp-rename' ),\n      through2 = require ( 'through2' ),"
    );
  }

  const marker = '/* PATCH: normalize legacy compound @extend syntax for dart-sass */';

  if ( source.includes ( marker ) ) {
    console.log ( '[postinstall] pacco scss task already patched' );
    return;
  }

  const target = ".pipe ( plumber ( plumberU.error ) )";
  const inject = [
    ".pipe ( plumber ( plumberU.error ) )",
    "             .pipe ( through2.obj ( ( file, enc, cb ) => {",
    "               if ( file && file.contents ) {",
    "                 const source = file.contents.toString ( 'utf8' );",
    "                 const patched = source.replace ( /@extend\\s+((?:[%\\.][A-Za-z0-9_-]+)(?:\\.[A-Za-z0-9_-]+)+)\\s*;/g, ( _, selector ) => {",
    "                   const tokens = selector.split ( '.' ).filter ( Boolean );",
    "                   if ( !tokens.length ) return _;",
    "                   const firstToken = tokens.shift ();",
    "                   const first = selector[0] === '%' ? `%${String ( firstToken ).replace ( /^%/, '' )}` : `.${String ( firstToken ).replace ( /^[.%]/, '' )}`;",
    "                   const rest = tokens.map ( token => `.${String ( token ).replace ( /^[.%]/, '' )}` );",
    "                   return `@extend ${[first, ...rest].join ( ', ' )};`;",
    "                 });",
    "                 file.contents = Buffer.from ( patched );",
    "               }",
    "               cb ( null, file );",
    "             })) /* PATCH: normalize legacy compound @extend syntax for dart-sass */"
  ].join ( '\n' );

  if ( !source.includes ( target ) ) {
    console.warn ( '[postinstall] pacco scss task patch pattern not found, skipping' );
    return;
  }

  source = source.replace ( target, inject );
  fs.writeFileSync ( paccoScssTaskPath, source, 'utf8' );

  console.log ( '[postinstall] patched pacco scss task for dart-sass' );

};

const patchPaccoScssTaskAdvanced = () => {

  if ( !fs.existsSync ( paccoScssTaskPath ) ) {
    console.log ( '[postinstall] pacco scss task not found for advanced patch, skipping' );
    return;
  }

  let source = fs.readFileSync ( paccoScssTaskPath, 'utf8' );
  let changed = false;

  const replacements = [
    [
      "const patched = source.replace ( /@extend\\s+((?:[%\\.][A-Za-z0-9_-]+)(?:\\.[A-Za-z0-9_-]+)+)\\s*;/g, ( _, selector ) => {",
      "let patched = source.replace ( /@extend\\s+((?:[%\\.][A-Za-z0-9_-]+)(?:\\.[A-Za-z0-9_-]+)+)\\s*;/g, ( _, selector ) => {"
    ],
    [
      "file.contents = Buffer.from ( patched );",
      "patched = patched.replace ( /@extend\\s+([A-Za-z][A-Za-z0-9_-]*)\\.([A-Za-z0-9_-]+)\\s*;/g, '@extend $1, .$2;' );\n                 patched = patched.replace ( /@extend\\s+%raisable%z-depth-#\\{\\$depth\\}\\s*;/g, '@extend %raisable;\\n        @extend %z-depth-#{$depth};' );\n                 file.contents = Buffer.from ( patched );"
    ],
    [
      ".pipe ( gulpif ( plugins.sass.enabled, () => require ( 'gulp-sass' )( require ( 'node-sass' ) )( plugins.sass.options ) ) )",
      ".pipe ( gulpif ( plugins.sass.enabled, () => {\n               const sassOptions = _.assign ( {}, plugins.sass.options, {\n                 quietDeps: true,\n                 silenceDeprecations: [ 'legacy-js-api', 'if-function', 'global-builtin', 'color-functions', 'slash-div' ],\n                 logger: {\n                   warn () {},\n                   debug () {}\n                 }\n               });\n               return require ( 'gulp-sass' )( require ( 'node-sass' ) )( sassOptions );\n             }))"
    ]
  ];

  for ( const [from, to] of replacements ) {
    if ( source.includes ( from ) && !source.includes ( to ) ) {
      source = source.replace ( from, to );
      changed = true;
    }
  }

  if ( changed ) {
    fs.writeFileSync ( paccoScssTaskPath, source, 'utf8' );
    console.log ( '[postinstall] patched pacco scss task advanced compatibility' );
  } else {
    console.log ( '[postinstall] pacco scss task advanced compatibility already patched' );
  }

};

const patchCreateReactContext = () => {

  const candidates = [
    path.join ( nodeModulesPath, 'create-react-context', 'lib', 'index.js' ),
    path.join ( nodeModulesPath, 'overstated', 'node_modules', 'create-react-context', 'lib', 'index.js' ),
    path.join ( nodeModulesPath, 'unstated', 'node_modules', 'create-react-context', 'lib', 'index.js' ),
    path.join ( nodeModulesPath, 'unstated-connect2', 'node_modules', 'create-react-context', 'lib', 'index.js' )
  ];

  const replacement = [
    "'use strict';",
    '',
    'exports.__esModule = true;',
    '',
    "var React = require('react');",
    '',
    'function createReactContext(defaultValue, _calculateChangedBits) {',
    '  return React.createContext(defaultValue);',
    '}',
    '',
    'exports.default = createReactContext;',
    "module.exports = exports['default'];",
    ''
  ].join ( '\n' );

  let patchedCount = 0;

  for ( const targetPath of candidates ) {

    if ( !fs.existsSync ( targetPath ) ) continue;

    const source = fs.readFileSync ( targetPath, 'utf8' );

    if ( source.includes ( 'return React.createContext(defaultValue);' ) ) continue;

    fs.writeFileSync ( targetPath, replacement, 'utf8' );
    patchedCount += 1;

  }

  if ( patchedCount ) {
    console.log ( `[postinstall] patched create-react-context in ${patchedCount} location(s)` );
  } else {
    console.log ( '[postinstall] create-react-context already patched (or not installed)' );
  }

};

const patchNotableScssCompounds = () => {

  const replacements = [
    [ '@extend .layout.vertical;', '@extend .layout, .vertical;' ],
    [ '@extend .floated.left;', '@extend .floated, .left;' ],
    [ '@extend .spaced.left;', '@extend .spaced, .left;' ],
    [ '@extend .spaced.right;', '@extend .spaced, .right;' ],
    [ '@extend .card.vertical;', '@extend .card, .vertical;' ],
    [ '@extend %icon.corner.top-right;', '@extend %icon, .corner, .top-right;' ],
    [ '@extend .layout.resizable.horizontal;', '@extend .layout, .resizable, .horizontal;' ],
    [ '@extend .popover.no-tip;', '@extend .popover, .no-tip;' ],
    [ '@extend textarea.unresizable;', '@extend textarea, .unresizable;' ],
    [ '@extend %raisable%z-depth-#{$depth};', '@extend %raisable;\n        @extend %z-depth-#{$depth};' ]
  ];

  let patchedCount = 0;

  for ( const targetPath of notableScssPaths ) {

    if ( !fs.existsSync ( targetPath ) ) continue;

    let source = fs.readFileSync ( targetPath, 'utf8' );
    let changed = false;

    for ( const [from, to] of replacements ) {
      if ( source.includes ( from ) ) {
        source = source.split ( from ).join ( to );
        changed = true;
      }
    }

    if ( changed ) {
      fs.writeFileSync ( targetPath, source, 'utf8' );
      patchedCount += 1;
    }

  }

  if ( patchedCount ) {
    console.log ( `[postinstall] patched notable scss compounds in ${patchedCount} file(s)` );
  } else {
    console.log ( '[postinstall] notable scss compounds already patched (or files missing)' );
  }

};

const patchSveltoScssCompounds = () => {

  const replacements = [
    [ '@extend .layout.vertical;', 'flex-direction: column;\n  overflow: auto;' ],
    [
      '@extend .layout.resizable.horizontal;',
      '&.sash-dragging {\n    cursor: col-resize !important;\n\n    html.windows & {\n      cursor: ew-resize !important; // Windows does not even use the right one...\n    }\n\n    & > *:not(.sash) {\n      pointer-events: none !important;\n    }\n  }\n\n  & > .sash {\n    @include absolute ( 0 auto 0 auto );\n    cursor: col-resize;\n    width: $layout-resizable-sash-size;\n    margin-left: - $layout-resizable-sash-size / 2;\n    transform: translateX( - $layout-resizable-sash-size / 2 ); // Starting hidden\n\n    html.windows & {\n      cursor: ew-resize !important; // Windows does not even use the right one...\n    }\n  }'
    ],
    [ '@extend %icon.corner.top-right;', '@include absolute ( 0 0 auto auto );' ],
    [ '@extend .popover.no-tip;', '&:after {\n    display: none;\n  }' ],
    [ '@extend textarea.unresizable;', 'resize: none;' ],
    [ '@extend %raisable%z-depth-#{$depth};', '@extend %raisable;\n        @extend %z-depth-#{$depth};' ]
  ];

  let patchedCount = 0;

  for ( const targetPath of sveltoScssPaths ) {

    if ( !fs.existsSync ( targetPath ) ) continue;

    let source = fs.readFileSync ( targetPath, 'utf8' );
    let changed = false;

    for ( const [from, to] of replacements ) {
      if ( source.includes ( from ) ) {
        source = source.split ( from ).join ( to );
        changed = true;
      }
    }

    if ( changed ) {
      fs.writeFileSync ( targetPath, source, 'utf8' );
      patchedCount += 1;
    }

  }

  if ( patchedCount ) {
    console.log ( `[postinstall] patched svelto scss compounds in ${patchedCount} file(s)` );
  } else {
    console.log ( '[postinstall] svelto scss compounds already patched (or files missing)' );
  }

};

try {

  patchPaccoCli ();
  patchGulpIf ();
  patchPaccoScssTask ();
  patchPaccoScssTaskAdvanced ();
  patchCreateReactContext ();
  patchNotableScssCompounds ();
  patchSveltoScssCompounds ();

} catch ( error ) {

  console.warn ( '[postinstall] failed to patch dependencies:', error.message );

}
