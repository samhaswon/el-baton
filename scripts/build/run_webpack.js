/* IMPORT */

const fs = require ( 'fs' );
const path = require ( 'path' );
const webpack = require ( 'webpack' );

/* HELPERS */

const [, , configPathArg, ...expectedOutputArgs] = process.argv;

if ( !configPathArg ) {
  throw new Error ( '[build:webpack] Missing webpack config path argument' );
}

const projectDir = path.resolve ( __dirname, '..', '..' );
const configPath = path.resolve ( projectDir, configPathArg );
const expectedOutputPaths = expectedOutputArgs.map ( expectedOutputArg => path.resolve ( projectDir, expectedOutputArg ) );
const configExport = require ( configPath );
const config = typeof configExport === 'function' ? configExport ({}, {}) : configExport;

const compiler = webpack ( config );

compiler.run ( ( error, stats ) => {

  const finalize = exitCode => {
    compiler.close ( closeError => {
      if ( closeError ) {
        console.error ( closeError );
        process.exitCode = 1;
        return;
      }

      process.exitCode = exitCode;
    });
  };

  if ( error ) {
    console.error ( error.stack || error.message || error );

    if ( error.details ) {
      console.error ( error.details );
    }

    finalize ( 1 );
    return;
  }

  const info = stats.toJson ({
    all: false,
    assets: true,
    errorDetails: true,
    errors: true,
    timings: true,
    warnings: true
  });

  if ( stats.hasWarnings () ) {
    console.warn ( stats.toString ({
      all: false,
      colors: false,
      timings: true,
      warnings: true
    }) );
  }

  if ( stats.hasErrors () ) {
    console.error ( stats.toString ({
      all: false,
      colors: false,
      errorDetails: true,
      errors: true,
      timings: true
    }) );
    finalize ( 1 );
    return;
  }

  for ( let index = 0, l = expectedOutputPaths.length; index < l; index++ ) {
    const expectedOutputPath = expectedOutputPaths[index];

    if ( !fs.existsSync ( expectedOutputPath ) ) {
      console.error ( `[build:webpack] Webpack completed without creating expected output "${expectedOutputPath}"` );
      finalize ( 1 );
      return;
    }
  }

  const assets = Array.isArray ( info.assets ) ? info.assets.map ( asset => asset.name ).join ( ', ' ) : '';
  const assetsSuffix = assets ? ` assets=${assets}` : '';

  console.log ( `[build:webpack] Built ${path.relative ( projectDir, configPath )}${assetsSuffix}` );

  finalize ( 0 );

});
