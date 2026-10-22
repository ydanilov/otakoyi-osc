import type { TouchLightTokens } from "@osc/tokens";

/**
 * Touch light (Figma `Touch Light`, board "Touch light — press response"): while a finger is on a
 * control a soft light blooms under it inside the touch surface, follows it 1:1 and fades on
 * release — the iOS 26 text-field touch highlight. Pure numbers here; `packages/ui` draws it
 * (Skia for the continuous controls, a view for the pads and buttons).
 *
 * - Halo: brand primary at `haloOpacity`, a radial gradient to 0. Core: `core` at `coreOpacity`,
 *   `coreScale` × the halo. Normal blend, below labels and icons.
 * - In: `inMs` ease-out, scale `fromScale` → 1 and opacity 0 → 1. Out: `outMs` ease-in.
 *   Reduce Motion: opacity only, no scale.
 * - Never shown on a disabled or view-only control.
 */

/** Which surface the light sits in; decides its size. */
export type TouchLightKind = "surface" | "fader" | "knob" | "stick";

export interface TouchLightSize {
  /** Halo diameter, px. */
  halo: number;
  /** Core diameter, px. */
  core: number;
}

/**
 * Light size for a surface. `measure` is the surface width for `surface` (pads, buttons, toggles,
 * segments, quick actions), the disc diameter for `knob`, and ignored for `fader` (a fixed size
 * on the thumb) and `stick` (fixed, thumbstick and XY pad).
 */
export function touchLightSize(
  kind: TouchLightKind,
  measure: number,
  tk: TouchLightTokens,
): TouchLightSize {
  "worklet";
  const m = Number.isFinite(measure) && measure > 0 ? measure : 0;
  const halo =
    kind === "fader"
      ? tk.faderThumb
      : kind === "stick"
        ? tk.stick
        : kind === "knob"
          ? m * tk.knobScale
          : m * tk.padScale;
  return { halo, core: halo * tk.coreScale };
}

/** Whether a control may show the light at all: never when disabled or view-only. */
export function touchLightAllowed(disabled: boolean | undefined): boolean {
  "worklet";
  return !disabled;
}

export interface TouchLightMotion {
  /** Scale the light starts from when it blooms in (1 = no scale animation). */
  fromScale: number;
  inMs: number;
  outMs: number;
}

/** Bloom in / fade out timings. Reduce Motion keeps the opacity fade and drops the scale. */
export function touchLightMotion(reduceMotion: boolean, tk: TouchLightTokens): TouchLightMotion {
  "worklet";
  return { fromScale: reduceMotion ? 1 : tk.fromScale, inMs: tk.inMs, outMs: tk.outMs };
}

/**
 * Where the light sits on a knob: on the disc centre, nudged toward the finger by `knobOffset` ×
 * the finger's distance, at most `knobOffset` × the disc radius — so it reads as "lit from where
 * you touch" without leaving the disc.
 */
export function knobLightCenter(
  touch: { x: number; y: number },
  center: { x: number; y: number },
  discR: number,
  tk: TouchLightTokens,
): { x: number; y: number } {
  "worklet";
  const dx = touch.x - center.x;
  const dy = touch.y - center.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || !(discR > 0)) return { x: center.x, y: center.y };
  const shift = Math.min(d * tk.knobOffset, discR * tk.knobOffset);
  return { x: center.x + (dx / d) * shift, y: center.y + (dy / d) * shift };
}

/**
 * A light pinned at a point (stories, Figma "State=Pressed" snapshots): `x` / `y` are fractions of
 * the surface (0..1); `index` picks the cell in a multi-cell control (segment, group button).
 */
export interface TouchLightPin {
  x: number;
  y: number;
  index?: number;
}

/** Whether a pin applies to the light of cell `index` (0 for single-surface controls). */
export function pinMatches(pin: TouchLightPin | null | undefined, index = 0): boolean {
  return !!pin && (pin.index ?? 0) === index;
}

/** Pinned point in px for a surface of `width` × `height`, clamped to the surface. */
export function pinPoint(
  pin: TouchLightPin,
  width: number,
  height: number,
): { x: number; y: number } {
  "worklet";
  const c = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
  return { x: c(pin.x) * width, y: c(pin.y) * height };
}
