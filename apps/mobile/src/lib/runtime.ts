import Constants, { ExecutionEnvironment } from "expo-constants";

/**
 * Running inside Expo Go (the store app that loads the dev server's bundle) rather than a
 * development or store build. Every native module the app uses ships in Expo Go for SDK 58
 * (docs/run-on-device.md), so this only labels the build in Settings; anything that ever needs a
 * development build degrades on this flag instead of crashing.
 */
export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
