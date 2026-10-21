/**
 * Platform-agnostic control logic: value mapping, gestures, throttling and OSC message building.
 * The Skia components (app) and the web pult only draw and forward gestures; everything that decides
 * *what* is sent lives here and is unit-tested.
 */
import { message, toArg, type OscMessage } from "@osc/core";
import type { Control, ControlOf } from "@osc/schema";

export type Curve = "linear" | "log" | "exp";

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Position 0..1 on the control → normalised value 0..1 through a response curve. */
export function applyCurve(pos: number, curve: Curve): number {
  const p = clamp(pos);
  if (curve === "log") return p * p; // fine control at the bottom (perceived loudness / brightness)
  if (curve === "exp") return Math.sqrt(p);
  return p;
}

export function invertCurve(value: number, curve: Curve): number {
  const v = clamp(value);
  if (curve === "log") return Math.sqrt(v);
  if (curve === "exp") return v * v;
  return v;
}

export interface Range {
  min: number;
  max: number;
  step?: number | undefined;
  curve?: Curve;
  invert?: boolean;
  int?: boolean;
}

/** Control position (0..1) → output value in the control's range. */
export function positionToValue(pos: number, r: Range): number {
  const p = r.invert ? 1 - clamp(pos) : clamp(pos);
  let v = r.min + applyCurve(p, r.curve ?? "linear") * (r.max - r.min);
  if (r.step) v = r.min + Math.round((v - r.min) / r.step) * r.step;
  if (r.int) v = Math.round(v);
  return roundFloat(clamp(v, Math.min(r.min, r.max), Math.max(r.min, r.max)));
}

/** Output value → control position (0..1). Used for feedback and defaults. */
export function valueToPosition(value: number, r: Range): number {
  const n = (value - r.min) / (r.max - r.min || 1);
  const p = invertCurve(clamp(n), r.curve ?? "linear");
  return r.invert ? 1 - p : p;
}

const roundFloat = (v: number) => Math.round(v * 1e6) / 1e6;

// ---------- gestures ----------

/** Fader: pointer position along the track → position. Vertical faders grow upwards. */
export function faderPosition(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  orientation: "vertical" | "horizontal",
): number {
  return orientation === "vertical"
    ? clamp(1 - pointer.y / size.height)
    : clamp(pointer.x / size.width);
}

/**
 * Relative drag (used for knobs and for "fine" fader moves): pixels moved → position delta.
 * `sensitivity` is pixels for a full 0→1 sweep; holding a second finger can raise it for fine control.
 */
export function dragDelta(dx: number, dy: number, sensitivity = 200): number {
  "worklet";
  return (dx - dy) / sensitivity;
}

/** Fingers at which a drag switches to fine mode. */
export const FINE_POINTERS = 2;

/**
 * Relative drag state, shared by faders and knobs (runs as a worklet on the UI thread).
 * The anchor is re-taken whenever the number of fingers changes, so adding or lifting the second
 * finger never makes the value jump — it only changes the speed from that point on.
 */
export interface DragState {
  /** Position (0..1) when the current segment started. */
  anchor: number;
  /** Drag distance (px) when the current segment started. */
  anchorDistance: number;
  pointers: number;
}

export function startDrag(pos: number, pointers: number): DragState {
  "worklet";
  return { anchor: pos, anchorDistance: 0, pointers };
}

/**
 * Next position for a relative drag. `distance` = px dragged in the increasing direction since the
 * gesture began; `length` = px for a full 0→1 sweep. Returns the new position and the updated state.
 */
export function relativeDrag(
  state: DragState,
  current: number,
  distance: number,
  pointers: number,
  length: number,
  fineFactor: number,
): { pos: number; state: DragState; fine: boolean } {
  "worklet";
  let st = state;
  if (pointers !== state.pointers) st = { anchor: current, anchorDistance: distance, pointers };
  const fine = st.pointers >= FINE_POINTERS;
  const factor = fine ? fineFactor : 1;
  const pos = Math.min(
    1,
    Math.max(0, st.anchor + ((distance - st.anchorDistance) / Math.max(1, length)) * factor),
  );
  return { pos, state: st, fine };
}

/** Value a control returns to on double-tap. */
export function resetValue(c: {
  default?: number | undefined;
  centered?: boolean;
  min: number;
  max: number;
}): number {
  return c.default ?? (c.centered ? (c.min + c.max) / 2 : c.min);
}

/** Knob sweep is 270° with the gap at the bottom. Angle in degrees, 0 = up, clockwise. */
export const KNOB_START = -135;
export const KNOB_SWEEP = 270;
export const knobAngle = (pos: number) => KNOB_START + clamp(pos) * KNOB_SWEEP;

/** XY pad: pointer → normalised point, y grows upwards. */
export function xyPosition(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
) {
  return { x: clamp(pointer.x / size.width), y: clamp(1 - pointer.y / size.height) };
}

/** Hold-to-confirm progress for an elapsed press time. */
export const holdProgress = (elapsedMs: number, holdMs: number) => clamp(elapsedMs / holdMs);

// ---------- throttling ----------

/**
 * Leading + trailing throttle for continuous controls: the first move sends immediately,
 * moves inside the window are coalesced, and the last value is always sent.
 */
export function createThrottle<T>(hz: number, send: (v: T) => void, now: () => number = Date.now) {
  const interval = 1000 / hz;
  let last = -Infinity;
  let pending: { v: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (pending) {
      last = now();
      const v = pending.v;
      pending = null;
      send(v);
    }
  };
  return {
    push(v: T) {
      const t = now();
      if (t - last >= interval && !timer) {
        last = t;
        send(v);
      } else {
        pending = { v };
        if (!timer) timer = setTimeout(flush, Math.max(0, interval - (t - last)));
      }
    },
    /** Send the pending value now (on release). */
    flush() {
      if (timer) clearTimeout(timer);
      flush();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

// ---------- colour ----------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHsv([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const d = max - Math.min(rn, gn, bn);
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [roundFloat(h / 360), roundFloat(max ? d / max : 0), roundFloat(max)];
}

export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return (
    "#" +
    [f(5), f(3), f(1)]
      .map((x) =>
        Math.round(x * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

// ---------- labels & meters ----------

export function formatValue(
  value: number | string | boolean | null,
  opts: { format?: string | undefined; unit?: string | undefined; decimals?: number } = {},
): string {
  const text =
    typeof value === "number"
      ? Number.isInteger(value)
        ? String(value)
        : value.toFixed(
            opts.decimals ?? (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2),
          )
      : value === null
        ? "—"
        : String(value);
  const withUnit = opts.unit ? `${text}${/^[°%×]/.test(opts.unit) ? "" : " "}${opts.unit}` : text;
  return opts.format ? opts.format.replace("{value}", withUnit) : withUnit;
}

export type MeterLevel = "normal" | "warning" | "critical";
export function meterLevel(
  value: number,
  c: Pick<ControlOf<"meter">, "warnAt" | "criticalAt">,
): MeterLevel {
  if (c.criticalAt !== undefined && value >= c.criticalAt) return "critical";
  if (c.warnAt !== undefined && value >= c.warnAt) return "warning";
  return "normal";
}

/** Fill `{row}`, `{col}`, `{index}` (0-based) in a button-grid address. */
export function gridCellAddress(template: string, row: number, col: number, cols: number): string {
  return template
    .replace(/\{row\}/g, String(row))
    .replace(/\{col\}/g, String(col))
    .replace(/\{index\}/g, String(row * cols + col));
}

// ---------- OSC messages per control ----------

/** The value a control holds in the shared state store (what the bridge syncs between devices). */
export type ControlValue =
  | number
  | boolean
  | string
  | { x: number; y: number }
  | { pressed: boolean }
  | { cell: number; on: boolean }
  | null;

const num = (v: number, int?: boolean) =>
  int ? { type: "i" as const, value: Math.round(v) } : { type: "f" as const, value: v };

/**
 * Build the OSC messages a control sends for a given interaction.
 * Returns [] for display-only controls.
 */
export function messagesFor(c: Control, value: ControlValue): OscMessage[] {
  switch (c.type) {
    case "button": {
      const pressed =
        typeof value === "object" && value !== null && "pressed" in value
          ? value.pressed
          : Boolean(value);
      const args = pressed ? c.press : c.release;
      return args && args.length ? [message(c.address, ...args)] : [];
    }
    case "toggle":
      return [message(c.address, ...(value ? c.on : c.off))];
    case "fader":
    case "knob":
      return typeof value === "number" ? [{ address: c.address, args: [num(value, c.int)] }] : [];
    case "xy": {
      if (typeof value !== "object" || value === null || !("x" in value)) return [];
      const x = c.x.min + value.x * (c.x.max - c.x.min);
      const y = c.y.min + value.y * (c.y.max - c.y.min);
      return [{ address: c.address, args: [num(roundFloat(x)), num(roundFloat(y))] }];
    }
    case "segmented": {
      const opt = typeof value === "number" ? c.options[value] : undefined;
      return opt ? [message(c.address, opt.value)] : [];
    }
    case "sceneList": {
      const scene = c.scenes.find((s) => s.id === value);
      if (!scene) return [];
      return [
        {
          address: c.address,
          args: [toArg(scene.value), ...(c.crossfade !== undefined ? [num(c.crossfade)] : [])],
        },
      ];
    }
    case "buttonGrid": {
      if (typeof value !== "object" || value === null || !("cell" in value)) return [];
      const row = Math.floor(value.cell / c.cols);
      const col = value.cell % c.cols;
      return [message(gridCellAddress(c.address, row, col, c.cols), value.on ? 1 : 0)];
    }
    case "holdToConfirm":
      return value === true ? [message(c.address, ...c.args)] : [];
    case "colorPicker": {
      if (typeof value !== "string") return [];
      const rgb = hexToRgb(value);
      if (c.format === "hex") return [message(c.address, value.toUpperCase())];
      if (c.format === "rgbInt")
        return [{ address: c.address, args: rgb.map((v) => num(v, true)) }];
      if (c.format === "hsvFloat")
        return [{ address: c.address, args: rgbToHsv(rgb).map((v) => num(v)) }];
      return [{ address: c.address, args: rgb.map((v) => num(roundFloat(v / 255))) }];
    }
    case "label":
    case "meter":
      return [];
    case "buttonGroup":
    case "thumbstick":
    case "image":
    case "mic":
    case "prompt":
      return []; // TODO(feat/new-controls): message mapping lands in the next commit
  }
}

/** Initial state value of a control before any feedback arrives. */
export function initialValue(c: Control): ControlValue {
  switch (c.type) {
    case "fader":
    case "knob":
      return c.default ?? (c.centered ? (c.min + c.max) / 2 : c.min);
    case "toggle":
      return c.default;
    case "xy":
      return { x: 0.5, y: 0.5 };
    case "segmented":
      return c.default;
    case "sceneList":
      return null;
    case "colorPicker":
      return c.default ?? c.swatches?.[0] ?? "#FFFFFF";
    case "label":
      return c.text;
    case "meter":
      return c.min;
    case "button":
      return { pressed: false };
    case "buttonGrid":
    case "holdToConfirm":
    case "buttonGroup":
    case "thumbstick":
    case "image":
    case "mic":
    case "prompt":
      return null;
  }
}
