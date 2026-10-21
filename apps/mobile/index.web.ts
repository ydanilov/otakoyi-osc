// Web (the browser fallback pult): CanvasKit must be loaded before any Skia canvas renders.
import "@expo/metro-runtime";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  // Synchronous require keeps the router in the main bundle (no async chunk in single-page export).
  require("expo-router/entry");
});
