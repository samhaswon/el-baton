/* IMPORT */

const path = require ( 'path' );
const MiniCssExtractPlugin = require ( 'mini-css-extract-plugin' );
const CssMinimizerPlugin = require ( 'css-minimizer-webpack-plugin' );
const CopyWebpackPlugin = require ( 'copy-webpack-plugin' );
const HtmlWebpackPlugin = require ( 'html-webpack-plugin' );
const TerserPlugin = require ( 'terser-webpack-plugin' );
const {isDevelopment, shared} = require ( './webpack.shared.js' );

/* CONFIG */

const cssLoader = isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader;

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
        test: /\.module\.css$/,
        use: [
          cssLoader,
          {
            loader: 'css-loader',
            options: {
              modules: {
                exportLocalsConvention: 'as-is',
                localIdentName: isDevelopment ? '[path][name]__[local]' : '[hash:base64:8]',
                namedExport: false
              }
            }
          }
        ]
      },
      {
        test: /\.css$/,
        exclude: /\.module\.css$/,
        use: [ cssLoader, 'css-loader' ]
      },
      {
        test: /\.(png|jpe?g|gif|svg|ico|ttf|woff2?|eot)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    ...shared.plugins,
    ...( isDevelopment ? [] : [
      new MiniCssExtractPlugin ({
        filename: 'renderer.css'
      })
    ]),
    new HtmlWebpackPlugin ({
      template: path.resolve ( __dirname, 'src/renderer/index.html' ),
      filename: 'index.html'
    }),
    new CopyWebpackPlugin ({
      patterns: [
        {
          from: path.resolve ( __dirname, 'src/renderer/template/runtime' ),
          to: path.resolve ( __dirname, 'dist/renderer' )
        },
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
      }),
      new CssMinimizerPlugin ()
    ]
  }
};

/* EXPORT */

module.exports = config;
