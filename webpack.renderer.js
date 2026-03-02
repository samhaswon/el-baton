/* IMPORT */

const path = require ( 'path' );
const CopyWebpackPlugin = require ( 'copy-webpack-plugin' );
const HtmlWebpackPlugin = require ( 'html-webpack-plugin' );
const TerserPlugin = require ( 'terser-webpack-plugin' );
const {isDevelopment, shared} = require ( './webpack.shared.js' );

/* CONFIG */

const config = {
  ...shared,
  target: 'electron-renderer',
  entry: path.resolve ( __dirname, 'src/renderer/index.ts' ),
  output: {
    path: path.resolve ( __dirname, 'dist/renderer' ),
    filename: 'renderer.js',
    publicPath: '',
    assetModuleFilename: 'assets/[name][ext]'
  },
  devtool: isDevelopment ? 'eval-source-map' : false,
  devServer: {
    static: path.resolve ( __dirname, 'dist/renderer' ),
    historyApiFallback: true,
    allowedHosts: [ 'localhost', '127.0.0.1' ]
  },
  externals: {
    'cmark-gfm': 'commonjs2 cmark-gfm',
    'spellchecker': 'commonjs2 spellchecker'
  },
  module: {
    rules: [
      ...shared.module.rules,
      {
        test: /\.css$/,
        use: [ 'style-loader', 'css-loader' ]
      },
      {
        test: /\.(png|jpe?g|gif|svg|ico|ttf|woff2?|eot)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    ...shared.plugins,
    new HtmlWebpackPlugin ({
      template: path.resolve ( __dirname, 'src/renderer/index.html' ),
      filename: 'index.html'
    }),
    new CopyWebpackPlugin ({
      patterns: [
        {
          from: path.resolve ( __dirname, 'src/renderer/template/dist' ),
          to: path.resolve ( __dirname, 'dist/renderer' )
        }
      ]
    })
  ],
  optimization: {
    minimize: !isDevelopment,
    minimizer: [
      new TerserPlugin ({
        parallel: true,
        terserOptions: {
          keep_fnames: true
        }
      })
    ]
  }
};

/* EXPORT */

module.exports = config;
