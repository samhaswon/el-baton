
/* IMPORT */

const TerserPlugin = require ( 'terser-webpack-plugin' ),
      TSConfigPathsPlugin = require ( 'tsconfig-paths-webpack-plugin' ),
      path = require ( 'path' ),
      webpack = require ( 'webpack' );

const isDevelopment = process.env.NODE_ENV !== 'production';

const babelPresetEnv = [ '@babel/preset-env', {
  targets: {
    electron: '5.0'
  }
} ];

/* PLUGINS */

function PluginSkeletonOptimization ( compiler ) { // Loading heavy resources after the skeleton
  compiler.plugin ( 'compilation', compilation => {
    compilation.hooks.htmlWebpackPluginAfterHtmlProcessing = {
      async promise ( data ) {
        data.html = data.html.replace ( /<link(.*?)rel="stylesheet">(.*?)<body>(.*?)<script/, '$2<body>$3<link$1rel="stylesheet"><script' ); // Moving the main CSS to the bottom in order to make the skeleton load faster
        return data;
      }
    };
  });
}

/* CONFIG */

const config = {
  devtool: isDevelopment ? 'eval-source-map' : false,
  devServer: {
    allowedHosts: [ 'localhost', '127.0.0.1' ],
    disableHostCheck: true
  },
  resolve: {
    alias: {
      'create-react-context': path.resolve ( __dirname, 'src/common/create_react_context_shim.ts' ),
      'electron-util': path.resolve ( __dirname, 'src/common/electron_util_shim.ts' ),
      'overstated': path.resolve ( __dirname, 'src/renderer/lib/overstated.ts' )
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
        include: /src/,
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
      'Environment.isDevelopment': JSON.stringify ( process.env.NODE_ENV !== 'production' )
    }),
    PluginSkeletonOptimization
  ],
  optimization: {
    minimizer: [
      new TerserPlugin ({
        parallel: true,
        sourceMap: isDevelopment,
        terserOptions: {
          keep_fnames: true
        }
      })
    ]
  }
};

/* EXPORT */

module.exports = config;
