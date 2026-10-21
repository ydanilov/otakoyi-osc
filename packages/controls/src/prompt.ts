/**
 * Prompt control (ADR-015): text prompts for generative installations. Presets are created by the
 * client and stored by the bridge; the control's value is what is live right now.
 */

/** What a prompt control holds and syncs: the live texts (already resolved) and the blend amount. */
export interface PromptValue {
  /** Text in slot A, or null (no preset, or the preset is switched off). */
  a: string | null;
  /** Text in slot B (blend only). */
  b: string | null;
  /** 0 = all A, 1 = all B. */
  mix: number;
}

export interface PromptSelection {
  a?: string | null | undefined;
  b?: string | null | undefined;
  mix: number;
}

type Preset = { id: string; text: string; on: boolean };

/**
 * Resolve the selected preset ids into the live value: a missing or switched-off preset leaves its
 * slot empty; texts are cut to `maxLength`.
 */
export function promptValue(
  presets: readonly Preset[],
  sel: PromptSelection,
  maxLength: number,
): PromptValue {
  const text = (id: string | null | undefined) => {
    const p = id ? presets.find((x) => x.id === id) : undefined;
    return p && p.on ? p.text.slice(0, maxLength) : null;
  };
  return { a: text(sel.a), b: text(sel.b), mix: Math.min(1, Math.max(0, sel.mix)) };
}

/** Switch one preset on or off (returns a new list). */
export function togglePreset<T extends Preset>(presets: readonly T[], id: string): T[] {
  return presets.map((p) => (p.id === id ? { ...p, on: !p.on } : p));
}

export const isPromptValue = (v: unknown): v is PromptValue =>
  typeof v === "object" &&
  v !== null &&
  "mix" in v &&
  "a" in v &&
  "b" in v &&
  typeof (v as PromptValue).mix === "number";
