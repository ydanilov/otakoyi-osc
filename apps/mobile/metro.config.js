const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Monorepo support is automatic in current Expo SDKs (watchFolders / nodeModulesPaths not needed).
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: require.resolve("@osc/tokens/global.css"),
  inlineRem: 16,
});
