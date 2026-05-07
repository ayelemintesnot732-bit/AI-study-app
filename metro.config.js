const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for additional file types
config.resolver.assetExts.push('cjs', 'bin', 'pdf');
config.resolver.sourceExts.push('js', 'jsx', 'json', 'ts', 'tsx');

module.exports = config;
