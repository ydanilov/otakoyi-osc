import type { KeyValueStore } from "./pairing";

/** Control preferences in Settings (ADR-013). Per device; never part of the config. */
export interface Prefs {
  haptics: boolean;
  keepAwake: boolean;
}

/** Fine mode has no setting: it is always two fingers (ADR-007, ADR-013). */
export const DEFAULT_PREFS: Prefs = { haptics: true, keepAwake: true };
const KEY = "otakoyi.prefs";

export async function loadPrefs(kv: KeyValueStore): Promise<Prefs> {
  try {
    const raw = await kv.get(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return {
      haptics: typeof v.haptics === "boolean" ? v.haptics : DEFAULT_PREFS.haptics,
      keepAwake: typeof v.keepAwake === "boolean" ? v.keepAwake : DEFAULT_PREFS.keepAwake,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function savePrefs(kv: KeyValueStore, p: Prefs): Promise<void> {
  await kv.set(KEY, JSON.stringify(p)).catch(() => {});
}
