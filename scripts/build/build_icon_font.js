/* eslint-disable no-console */

const fs = require ( 'fs' );
const path = require ( 'path' );

const IconFontBuildr = require ( 'icon-font-buildr' ).default;

const rootPath = path.join ( __dirname, '..', '..' );
const configPath = path.join ( rootPath, 'icon_font.json' );
const templateGeneratedFontsPath = path.join ( rootPath, 'src', 'renderer', 'template', 'generated', 'fonts' );

const readConfig = () => {

  const content = fs.readFileSync ( configPath, 'utf8' );

  return JSON.parse ( content );

};

const ensureFile = filePath => {
  if ( !fs.existsSync ( filePath ) ) {
    throw new Error ( `Missing required file: ${path.relative ( rootPath, filePath )}` );
  }
};

const build = async () => {

  const config = readConfig (),
        fontName = config?.output?.fontName || 'IconFont',
        fontFileName = `${fontName}.woff2`,
        generatedFontPath = path.join ( templateGeneratedFontsPath, fontFileName ),
        builder = new IconFontBuildr ({
          ...config,
          output: {
            ...( config.output || {} ),
            fonts: templateGeneratedFontsPath,
            formats: ['woff2']
          }
        });

  if ( process.env.EL_BATON_SKIP_ICON_FONT_BUILD === '1' ) {
    ensureFile ( generatedFontPath );

    console.log ( '[icon:font] Skipped icon font regeneration (EL_BATON_SKIP_ICON_FONT_BUILD=1), reused existing font asset' );
    return;
  }

  await builder.build ();

  if ( !fs.existsSync ( generatedFontPath ) ) {
    throw new Error ( `Generated icon font not found: ${path.relative ( rootPath, generatedFontPath )}` );
  }

  console.log ( `[icon:font] Built ${path.relative ( rootPath, generatedFontPath )}` );

};

build ().catch ( error => {
  console.error ( '[icon:font] Failed to build icon font', error );
  process.exitCode = 1;
} );
