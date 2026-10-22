import { argValue, type OscMessage } from "@osc/core";
import { knobMode, valueToPosition } from "@osc/controls";
import type { Control, InstallationConfig } from "@osc/schema";
import type { PreviewParams } from "./preview";

/** What an OSC address does to the preview. */
export type PreviewBinding =
  | "brightness"
  | "hue"
  | "speed"
  | "jog"
  | "focus"
  | "tint"
  | "flash"
  | "blackout"
  | "scene"
  | "strobe"
  | "prompt";

/**
 * How the demo installation (packages/schema/examples/demo-installation.json) reacts, like a
 * TouchDesigner patch would: its own parameters by address, plus the system OSC (`/otakoyi/*`).
 */
export const DEMO_BINDINGS: Readonly<Record<string, PreviewBinding>> = {
  "/wall/intensity": "brightness",
  "/hall/brightness": "brightness",
  "/live/level": "brightness",
  "/wall/hue": "hue",
  "/live/color": "hue",
  "/wall/speed": "speed",
  "/hall/reactivity": "speed",
  "/live/jog": "jog",
  "/wall/focus": "focus",
  "/wall/tint": "tint",
  "/wall/flash": "flash",
  "/wall/blackout": "blackout",
  "/hall/blackout": "blackout",
  "/scene": "scene",
  "/hall/backdrop": "scene",
  "/live/strobe": "strobe",
  "/live/prompt": "prompt",
  "/live/prompt/a": "prompt",
};

/** Controls by the address they send on (fixed addresses only). */
export function controlsByAddress(config: InstallationConfig): Map<string, Control> {
  const out = new Map<string, Control>();
  for (const pult of config.pults)
    for (const page of pult.pages)
      for (const c of page.controls as Control[])
        if ("address" in c && typeof c.address === "string" && !out.has(c.address))
          out.set(c.address, c);
  return out;
}

const num = (m: OscMessage, i = 0): number | null => {
  const a = m.args[i];
  if (!a) return null;
  const v = argValue(a);
  return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 0..1 position of a numeric value on its control (curve and range applied). */
function position(c: Control | undefined, v: number): number {
  if (c && (c.type === "fader" || c.type === "knob"))
    return clamp01(
      valueToPosition(v, { min: c.min, max: c.max, curve: c.curve, invert: c.invert, int: c.int }),
    );
  return clamp01(v);
}

/**
 * Apply one OSC message to the preview. Returns the new params (or the same object when the
 * message does not concern the preview). Pure.
 */
export function applyToPreview(
  p: PreviewParams,
  m: OscMessage,
  bindings: Readonly<Record<string, PreviewBinding>>,
  controls: Map<string, Control>,
): PreviewParams {
  // System OSC from the bridge (installation actions, ADR-016).
  switch (m.address) {
    case "/otakoyi/flash":
      return { ...p, flash: p.flash + 1 };
    case "/otakoyi/blackout":
      return { ...p, blackout: (num(m) ?? 0) > 0 };
    case "/otakoyi/idle":
      return { ...p, idle: (num(m) ?? 0) > 0 };
    case "/otakoyi/pause":
      return { ...p, pause: (num(m) ?? 0) > 0 };
    case "/otakoyi/restart":
      return { ...p, restarts: p.restarts + 1, pause: false };
  }
  const kind = bindings[m.address];
  if (!kind) return p;
  const c = controls.get(m.address);
  const v = num(m);
  switch (kind) {
    case "brightness":
      return v === null ? p : { ...p, brightness: position(c, v) };
    case "speed":
      return v === null ? p : { ...p, speed: position(c, v) };
    case "jog": {
      // Relative fader: the change since the last message (a full track = max − min).
      const span = c?.type === "fader" || c?.type === "knob" ? c.max - c.min : 1;
      return v === null ? p : { ...p, speed: clamp01(p.speed + v / (span || 1)) };
    }
    case "hue": {
      if (v === null) return p;
      if (c?.type === "knob" && knobMode(c) === "hue") return { ...p, hue: v };
      const pos = position(c, v);
      const centered = c && "centered" in c && c.centered;
      return { ...p, hue: (centered ? pos - 0.5 : pos) * 360 };
    }
    case "focus": {
      const x = num(m, 0);
      const y = num(m, 1);
      return x === null || y === null ? p : { ...p, focus: { x: clamp01(x), y: clamp01(1 - y) } };
    }
    case "tint": {
      const a = m.args[0] ? argValue(m.args[0]) : null;
      if (typeof a === "string" && /^#[0-9a-f]{6}$/i.test(a)) {
        const n = parseInt(a.slice(1), 16);
        return { ...p, tint: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] };
      }
      const r = num(m, 0);
      const g = num(m, 1);
      const b = num(m, 2);
      if (r === null || g === null || b === null) return p;
      const scale = Math.max(r, g, b) > 1 ? 255 : 1;
      return { ...p, tint: [r / scale, g / scale, b / scale] };
    }
    case "flash":
      return (v ?? 0) > 0 ? { ...p, flash: p.flash + 1 } : p;
    case "blackout":
      // A hold-to-confirm sends 1 once: it toggles the wall's own blackout.
      return (v ?? 0) > 0 ? { ...p, blackout: !p.blackout } : p;
    case "strobe":
      return { ...p, strobe: (v ?? 0) > 0 };
    case "scene": {
      const raw = m.args[0] ? argValue(m.args[0]) : null;
      const scene =
        c?.type === "sceneList" ? c.scenes.find((s) => s.value === raw)?.label : undefined;
      return { ...p, scene: scene ?? (raw === null ? null : String(raw)) };
    }
    case "prompt": {
      const t = m.args[0] ? argValue(m.args[0]) : null;
      return { ...p, prompt: typeof t === "string" && t.trim() ? t.trim().slice(0, 80) : null };
    }
  }
}
