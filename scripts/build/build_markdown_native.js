const cp = require ( 'child_process' );
const fs = require ( 'fs' );
const path = require ( 'path' );

const rootPath = path.resolve ( __dirname, '..', '..' );
const addonPath = path.join ( rootPath, 'native', 'markdown' );
const outputPath = path.join ( addonPath, 'build', 'Release', 'markdown_native.node' );
const distPath = path.join ( rootPath, 'dist', 'native', 'markdown_native.node' );
const electronVersion = require ( path.join ( rootPath, 'node_modules', 'electron', 'package.json' ) ).version;
const runtime = process.argv.includes ( '--node' ) ? 'node' : 'electron';
const arch = process.env.NOTABLE_NATIVE_ARCH || process.arch;
const executable = path.join ( rootPath, 'node_modules', '.bin', process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp' );
const args = ['rebuild', `--directory=${addonPath}`, `--arch=${arch}`];

if ( runtime === 'electron' ) args.push ( `--target=${electronVersion}`, '--dist-url=https://electronjs.org/headers' );

const generate = cp.spawnSync ( process.execPath, [path.join ( rootPath, 'scripts', 'build', 'generate_markdown_emoji_table.js' )], { cwd: rootPath, stdio: 'inherit' } );
if ( generate.status !== 0 ) process.exit ( generate.status || 1 );

// Windows command shims (`*.cmd`) must run through cmd.exe. Without `shell`
// Node can fail before node-gyp starts, leaving CI with only a silent exit 1.
const result = cp.spawnSync ( executable, args, {
  cwd: rootPath,
  stdio: 'inherit',
  shell: process.platform === 'win32'
} );

if ( result.error ) throw result.error;
if ( result.status !== 0 ) process.exit ( result.status || 1 );
if ( !fs.existsSync ( outputPath ) ) throw new Error ( `[markdown-native] Missing build output: ${outputPath}` );

if ( runtime === 'electron' ) {
  fs.mkdirSync ( path.dirname ( distPath ), { recursive: true } );
  fs.copyFileSync ( outputPath, distPath );
}
