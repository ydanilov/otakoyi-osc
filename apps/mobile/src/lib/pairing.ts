import type { Pairing } from "@osc/protocol";
import type { Theme } from "@osc/schema";

/** Key/value storage behind an interface (AGENTS rule 5): SecureStore on native, localStorage on web. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const PAIRING_KEY = "otakoyi.pairing";

/**
 * The installation this device is paired with, plus the brand it showed last time, so the
 * client-branded loading screen can appear before the bridge answers on the next launch.
 */
export interface SavedPairing extends Pairing {
  brand?: { name: string; theme: Theme } | undefined;
}

export function createPairingStore(kv: KeyValueStore) {
  return {
    async load(): Promise<SavedPairing | null> {
      try {
        const raw = await kv.get(PAIRING_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw) as SavedPairing;
        return typeof p?.bridge === "string" ? p : null;
      } catch {
        return null;
      }
    },
    async save(p: SavedPairing): Promise<void> {
      try {
        await kv.set(PAIRING_KEY, JSON.stringify(p));
      } catch {
        // Storage unavailable (private mode): the pairing lasts for this session only.
      }
    },
    /** "Forget this installation". */
    async clear(): Promise<void> {
      try {
        await kv.remove(PAIRING_KEY);
      } catch {}
    },
  };
}

export type PairingStore = ReturnType<typeof createPairingStore>;

/** In-memory store (tests, and a fallback when the platform has none). */
export function memoryKeyValue(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    remove: async (k) => void m.delete(k),
  };
}
