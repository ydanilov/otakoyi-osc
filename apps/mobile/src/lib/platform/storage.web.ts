import type { KeyValueStore } from "../pairing";

/** Web pult: localStorage, per browser. */
const local: KeyValueStore = {
  get: async (k) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: async (k, v) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {}
  },
  remove: async (k) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {}
  },
};

export const secureStorage = local;
export const prefsStorage = local;
