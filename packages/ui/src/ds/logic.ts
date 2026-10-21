/**
 * Pure decisions behind the design-system components (AGENTS.md rule 6): components only draw and
 * forward gestures; everything that decides a value, a layout or a presentation lives here, tested.
 */
import { PHONE_BREAKPOINT } from "../pult/layout";

export interface NumericRange {
  min: number;
  max: number;
  /** Increment of the stepper; also sets the decimals shown. */
  step: number;
}

const clamp = (v: number, lo: number, hi: number) => {
  "worklet";
  return Math.min(hi, Math.max(lo, v));
};

/** Decimal places implied by a step (0.1 → 1, 0.25 → 2, 5 → 0). */
export function stepDecimals(step: number): number {
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/** Snap to the step grid anchored at `min`, without float noise (0.1 + 0.2 → 0.3). */
export function snapToStep(value: number, r: NumericRange): number {
  const snapped = r.min + Math.round((value - r.min) / r.step) * r.step;
  return Number(clamp(snapped, r.min, r.max).toFixed(stepDecimals(r.step)));
}

/** Stepper −/+ : one step in `direction`, snapped and clamped. */
export function stepValue(value: number, direction: 1 | -1, r: NumericRange): number {
  return snapToStep(value + direction * r.step, r);
}

/** Stepper display: fixed decimals from the step, so 22 shows as 22.0 when step is 0.5. */
export function formatStepped(value: number, step: number): string {
  return value.toFixed(stepDecimals(step));
}

export type ValueInputResult =
  { ok: true; value: number; clamped: boolean } | { ok: false; reason: "empty" | "nan" };

/**
 * Value Input commit: accepts "250", "0,5" (comma decimals from iOS locales), " 12.5 ".
 * Out-of-range numbers are clamped to min/max (and reported as `clamped`), never rejected.
 */
export function parseValueInput(
  text: string,
  r: { min?: number; max?: number; step?: number },
): ValueInputResult {
  const s = text.trim().replace(",", ".");
  if (s === "" || s === "-" || s === ".") return { ok: false, reason: "empty" };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return { ok: false, reason: "nan" };
  const n = Number(s);
  const lo = r.min ?? -Infinity;
  const hi = r.max ?? Infinity;
  let v = clamp(n, lo, hi);
  if (r.step) v = Number((Math.round(v / r.step) * r.step).toFixed(stepDecimals(r.step)));
  v = clamp(v, lo, hi);
  return { ok: true, value: v, clamped: v !== n };
}

export type DialogPresentation = "sheet" | "modal";

/** Phone → bottom sheet, tablet → centred modal (ADR-013), chosen by window width. */
export function dialogPresentation(windowWidth: number): DialogPresentation {
  return windowWidth < PHONE_BREAKPOINT ? "sheet" : "modal";
}

/** Width of a swipe drawer: 85 % of the window on phones, at most 380 pt. */
export function drawerWidth(windowWidth: number): number {
  return Math.round(Math.min(380, windowWidth * 0.85));
}

/**
 * Whether a drawer drag ends open. `travel` is how far the panel moved toward closed (pt, ≥ 0),
 * `velocity` the release speed toward closed (pt/s). A flick or more than a third of the width closes.
 */
export function drawerStaysOpen(travel: number, velocity: number, width: number): boolean {
  "worklet";
  if (velocity > 600) return false;
  if (velocity < -600) return true;
  return travel < width / 3;
}

/** Edge swipe that opens a drawer: far enough or fast enough toward the screen centre. */
export function edgeSwipeOpens(distance: number, velocity: number, width: number): boolean {
  "worklet";
  return velocity > 600 || distance > width / 3;
}

/** Hold-to-confirm progress 0…1 (Quick Action in hold mode). */
export function holdFraction(elapsedMs: number, holdMs: number): number {
  return holdMs <= 0 ? 1 : clamp(elapsedMs / holdMs, 0, 1);
}

/** Upload progress label for Image Upload / Image Tile, e.g. "64% · 2.1 / 3.3 MB". */
export function uploadLabel(progress: number, totalBytes?: number): string {
  const pct = `${Math.round(clamp(progress, 0, 1) * 100)}%`;
  if (!totalBytes) return pct;
  const mb = (b: number) => (b / 1_000_000).toFixed(1);
  return `${pct} · ${mb(totalBytes * clamp(progress, 0, 1))} / ${mb(totalBytes)} MB`;
}

/** Position 0…1 along a horizontal track from a touch x, for the Master Bar. */
export function trackPosition(x: number, width: number): number {
  "worklet";
  return width <= 0 ? 0 : clamp(x / width, 0, 1);
}
