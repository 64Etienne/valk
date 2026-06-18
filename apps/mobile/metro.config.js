// Metro s'auto-configure pour les monorepos depuis Expo SDK 52+ : aucune
// configuration watchFolders/nodeModulesPaths manuelle requise en npm workspaces.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
