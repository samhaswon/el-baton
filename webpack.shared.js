/* IMPORT */

const path = require ( 'path' );
const TSConfigPathsPlugin = require ( 'tsconfig-paths-webpack-plugin' );
const webpack = require ( 'webpack' );

/* SHARED */

const isDevelopment = process.env.NODE_ENV !== 'production';
const electronTarget = process.env.NOTABLE_ELECTRON_TARGET || '30.0';
const rendererSourcePath = path.resolve ( __dirname, 'src/renderer' );
const sourcePath = path.resolve ( __dirname, 'src' );

const babelPresetEnv = [ '@babel/preset-env', {
  targets: {
    electron: electronTarget
  }
} ];

let reactCompilerPlugins = [];

try {
  require.resolve ( 'babel-plugin-react-compiler' );
  require.resolve ( 'react-compiler-runtime' );
  reactCompilerPlugins = [[
    'babel-plugin-react-compiler',
    {
      target: '18'
    }
  ]];
} catch ( error ) {
  console.warn ( '[webpack] React Compiler packages not installed; skipping compiler transforms for renderer sources.' );
}

const shared = {
  mode: isDevelopment ? 'development' : 'production',
  resolve: {
    alias: {
      '@static': path.resolve ( __dirname, 'src/renderer/template/runtime' ),
      'create-react-context': path.resolve ( __dirname, 'src/common/create_react_context_shim.ts' ),
      'electron-util': path.resolve ( __dirname, 'src/common/electron_util_shim.ts' ),
      'overstated': path.resolve ( __dirname, 'src/renderer/lib/overstated.ts' )
    },
    fallback: {
      fsevents: false
    },
    extensions: [ '.ts', '.tsx', '.js', '.json' ],
    plugins: [
      new TSConfigPathsPlugin ()
    ]
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        include: /node_modules\/mermaid\/dist/,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
            presets: [
              babelPresetEnv
            ]
          }
        }
      },
      {
        test: /\.tsx?$/,
        include: rendererSourcePath,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
            presets: [
              babelPresetEnv,
              '@babel/preset-react',
              '@babel/preset-typescript'
            ],
            // React Compiler must run first in the Babel plugin pipeline.
            plugins: reactCompilerPlugins
          }
        }
      },
      {
        test: /\.tsx?$/,
        include: sourcePath,
        exclude: rendererSourcePath,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
            presets: [
              babelPresetEnv,
              '@babel/preset-react',
              '@babel/preset-typescript'
            ]
          }
        }
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin ({
      'Environment.isDevelopment': JSON.stringify ( isDevelopment ),
      '__static': 'globalThis.__static',
      '__non_webpack_require__': 'require'
    }),
    new webpack.IgnorePlugin ({
      resourceRegExp: /^fsevents$/
    })
  ]
};

/* EXPORT */

module.exports = {
  isDevelopment,
  shared
};
