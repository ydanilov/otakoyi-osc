import * as SecureStore from "expo-secure-store";
import type { KeyValueStore } from "../pairing";

/** Native: Keychain / Keystore through SecureStore (the pairing holds the installation PIN). */
export const secureStorage: KeyValueStore = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
  remove: (k) => SecureStore.deleteItemAsync(k),
};

/** Small preferences (haptics, keep awake): not secret, same store for simplicity. */
export const prefsStorage: KeyValueStore = secureStorage;
