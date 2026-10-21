/**
 * The demo installation's "output": a small generative picture whose brightness, hue and speed
 * follow the demo controls, so a reviewer sees that the controls do something. The simulator
 * updates `PreviewParams` from the OSC it receives; the app draws `previewBlobs()` every frame
 * (the functions marked "worklet" run on the UI thread).
 */

export interface PreviewParams {
  /** 0..1 overall light. */
  brightness: number;
  /** Hue shift in degrees, added to the palette. */
  hue: number;
  /** 0..1 motion speed. */
  speed: number;
  /** Where the light gathers, 0..1 each (y down). */
  focus: { x: number; y: number };
  /** Tint mixed into the palette (0..1 RGB), or null. */
  tint: [number, number, number] | null;
  /** Latched installation modes (system OSC). */
  blackout: boolean;
  idle: boolean;
  pause: boolean;
  strobe: boolean;
  /** Increments on every flash; the view fades a white flash when it changes. */
  flash: number;
  /** Increments on every restart; the view fades in from black when it changes. */
  restarts: number;
  /** Scene name from a scene list, shown as the caption. */
  scene: string | null;
  /** Live prompt text, shown as the caption. */
  prompt: string | null;
}

export const DEFAULT_PREVIEW: PreviewParams = {
  brightness: 0.6,
  hue: 0,
  speed: 0.4,
  focus: { x: 0.5, y: 0.5 },
  tint: null,
  blackout: false,
  idle: false,
  pause: false,
  strobe: false,
  flash: 0,
  restarts: 0,
  scene: null,
  prompt: null,
};

/** One light blob of a frame. Colours are rgba() strings, positions 0..1. */
export interface PreviewBlob {
  x: number;
  y: number;
  r: number;
  color: string;
}

/** Number of blobs drawn. */
export const PREVIEW_BLOBS = 5;
/** Palette before the hue shift: the demo brand's lime and cyan, plus a deep blue. */
const BASE_HUES = [95, 192, 220, 192, 95];

/** Light actually shown: blackout wins, idle dims, brightness scales the rest. */
export function previewLevel(p: Pick<PreviewParams, "brightness" | "blackout" | "idle">): number {
  "worklet";
  if (p.blackout) return 0;
  const b = Math.min(1, Math.max(0, p.brightness));
  return p.idle ? b * 0.35 : b;
}

/** Radians per second the pattern moves at; pause freezes it. */
export function previewRate(p: Pick<PreviewParams, "speed" | "pause">): number {
  "worklet";
  if (p.pause) return 0;
  return 0.15 + Math.min(1, Math.max(0, p.speed)) * 2.2;
}

/** HSV (h in degrees) → rgba string. */
export function hsva(h: number, s: number, v: number, a: number): string {
  "worklet";
  const hh = (((h % 360) + 360) % 360) / 60;
  const f = (n: number) => {
    const k = (n + hh) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const c = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  return `rgba(${c(f(5))}, ${c(f(3))}, ${c(f(1))}, ${Math.round(a * 1000) / 1000})`;
}

/**
 * Blobs for a frame. `phase` is the integrated motion (advance it by `previewRate * dt`), so a
 * speed change never makes the picture jump.
 */
export function previewBlobs(p: PreviewParams, phase: number): PreviewBlob[] {
  "worklet";
  const level = previewLevel(p);
  const out: PreviewBlob[] = [];
  for (let i = 0; i < PREVIEW_BLOBS; i++) {
    const a = phase * (0.6 + i * 0.17) + i * 1.9;
    const spread = 0.32 - i * 0.025;
    const x = p.focus.x + Math.cos(a) * spread;
    const y = p.focus.y + Math.sin(a * 1.3 + i) * spread * 0.8;
    const r = 0.28 + 0.08 * Math.sin(phase * 0.7 + i * 2.1);
    let h = BASE_HUES[i]! + p.hue;
    let s = 0.85;
    if (p.tint) {
      // Pull the hue toward the tint's own hue, keep the variety.
      const [tr, tg, tb] = p.tint;
      const mx = Math.max(tr, tg, tb);
      const mn = Math.min(tr, tg, tb);
      if (mx - mn > 0.05) {
        let th = 0;
        if (mx === tr) th = ((tg - tb) / (mx - mn)) % 6;
        else if (mx === tg) th = (tb - tr) / (mx - mn) + 2;
        else th = (tr - tg) / (mx - mn) + 4;
        // Shortest way round the wheel, a third of the way: tinted, not monochrome.
        const d = ((((th * 60 - h) % 360) + 540) % 360) - 180;
        h = h + d * 0.35;
        s = 0.7 + 0.3 * ((mx - mn) / mx);
      }
    }
    out.push({ x, y, r, color: hsva(h, s, 1, 0.55 * level + 0.02 * (level > 0 ? 1 : 0)) });
  }
  return out;
}

/** Strobe: on/off at 8 Hz while the strobe toggle is on. */
export function strobeOn(p: Pick<PreviewParams, "strobe" | "blackout">, timeS: number): boolean {
  "worklet";
  return p.strobe && !p.blackout && Math.floor(timeS * 16) % 2 === 0;
}

/** Caption under the picture: prompt, else scene, else the mode. */
export function previewCaption(p: PreviewParams): string {
  if (p.blackout) return "Blackout";
  if (p.pause) return "Paused";
  if (p.idle) return "Idle · ambient loop";
  if (p.prompt) return `“${p.prompt}”`;
  if (p.scene) return `Scene · ${p.scene}`;
  return "Live";
}
