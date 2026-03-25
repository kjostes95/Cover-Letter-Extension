const path = require('path');

module.exports = [
  {
    name: 'popup',
    entry: './src/popup/popup.ts',
    output: {
      filename: 'popup.js',
      path: path.resolve(__dirname, 'dist')
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    devtool: 'source-map'
  },
  {
    name: 'content',
    entry: './src/content/content.ts',
    output: {
      filename: 'content.js',
      path: path.resolve(__dirname, 'dist')
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    devtool: 'source-map'
  },
  {
    name: 'background',
    entry: './src/background/background.ts',
    output: {
      filename: 'background.js',
      path: path.resolve(__dirname, 'dist')
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    devtool: 'source-map'
  }
];
