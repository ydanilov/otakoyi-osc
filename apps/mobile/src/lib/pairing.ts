import type { Pairing } from "@osc/protocol";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "otakoyi.pairing";

/**
 * The bridge this device is paired with (from the QR / deep link). Native: Keychain via
 * SecureStore, because it holds the installation PIN. Web: localStorage (per browser).
 */
export async function loadPairing(): Promise<Pairing | null> {
  try {
    const raw =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(KEY)
        : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Pairing) : null;
  } catch {
    return null;
  }
}

export async function savePairing(p: Pairing): Promise<void> {
  const raw = JSON.stringify(p);
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // Storage unavailable (private mode): the pairing lasts for this session only.
  }
}

export async function clearPairing(): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {}
}
