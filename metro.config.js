const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('cjs', 'bin', 'pdf');
config.resolver.sourceExts.push('js', 'jsx', 'json', 'ts', 'tsx');

module.exports = config;
