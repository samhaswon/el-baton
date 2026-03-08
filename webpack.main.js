/* IMPORT */

const path = require ( 'path' );
const {isDevelopment, shared} = require ( './webpack.shared.js' );

/* CONFIG */

const config = {
  ...shared,
  target: 'electron-main',
  externals: {
    sqlite3: 'commonjs2 sqlite3'
  },
  entry: path.resolve ( __dirname, 'src/main/index.ts' ),
  output: {
    path: path.resolve ( __dirname, 'dist/main' ),
    filename: 'main.js'
  },
  module: {
    rules: [
      ...shared.module.rules
    ]
  },
  plugins: [
    ...shared.plugins
  ],
  devtool: isDevelopment ? 'eval-source-map' : false
};

/* EXPORT */

module.exports = config;
