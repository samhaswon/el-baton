/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );

const IconFontBuildr = require ( 'icon-font-buildr' ).default;

const rootPath = path.join ( __dirname, '..', '..' );
const configPath = path.join ( rootPath, 'icon_font.json' );
const templateBaseFontsPath = path.join ( rootPath, 'src', 'renderer', 'template', 'base', 'fonts' );
const templateDistFontsPath = path.join ( rootPath, 'src', 'renderer', 'template', 'dist', 'fonts' );

const readConfig = () => {

  const content = fs.readFileSync ( configPath, 'utf8' );

  return JSON.parse ( content );

};

const copyFont = ( sourcePath, destinationPath ) => {

  fs.mkdirSync ( path.dirname ( destinationPath ), { recursive: true } );
  fs.copyFileSync ( sourcePath, destinationPath );

};

const build = async () => {

  const config = readConfig (),
        fontName = config?.output?.fontName || 'IconFont',
        fontFileName = `${fontName}.woff2`,
        generatedFontPath = path.join ( templateBaseFontsPath, fontFileName ),
        mirroredFontPath = path.join ( templateDistFontsPath, fontFileName ),
        builder = new IconFontBuildr ({
          ...config,
          output: {
            ...( config.output || {} ),
            fonts: templateBaseFontsPath,
            formats: ['woff2']
          }
        });

  await builder.build ();

  if ( !fs.existsSync ( generatedFontPath ) ) {
    throw new Error ( `Generated icon font not found: ${path.relative ( rootPath, generatedFontPath )}` );
  }

  copyFont ( generatedFontPath, mirroredFontPath );

  console.log ( `[icon:font] Built ${path.relative ( rootPath, generatedFontPath )}` );
  console.log ( `[icon:font] Mirrored ${path.relative ( rootPath, mirroredFontPath )}` );

};

build ().catch ( error => {
  console.error ( '[icon:font] Failed to build icon font', error );
  process.exitCode = 1;
} );
