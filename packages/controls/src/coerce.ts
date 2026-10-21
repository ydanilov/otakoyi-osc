import type { Control } from "@osc/schema";
import { clamp, type ControlValue } from "./logic";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validate a value that arrived over the network (another device, the bridge) against its control.
 * Returns a safe value — clamped into range — or undefined when it can't belong to this control.
 * The bridge runs every incoming `set` through this before it reaches OSC.
 */
export function coerceValue(c: Control, v: unknown): ControlValue | undefined {
  switch (c.type) {
    case "fader":
    case "knob": {
      if (!isNum(v)) return undefined;
      const lo = Math.min(c.min, c.max);
      const hi = Math.max(c.min, c.max);
      const x = clamp(v, lo, hi);
      return c.int ? Math.round(x) : x;
    }
    case "toggle":
      return typeof v === "boolean" ? v : undefined;
    case "xy":
      return isObj(v) && isNum(v.x) && isNum(v.y) ? { x: clamp(v.x), y: clamp(v.y) } : undefined;
    case "button":
      return isObj(v) && typeof v.pressed === "boolean" ? { pressed: v.pressed } : undefined;
    case "segmented":
      return Number.isInteger(v) && (v as number) >= 0 && (v as number) < c.options.length
        ? (v as number)
        : undefined;
    case "sceneList":
      return typeof v === "string" && c.scenes.some((s) => s.id === v) ? v : undefined;
    case "buttonGrid":
      return isObj(v) &&
        Number.isInteger(v.cell) &&
        (v.cell as number) >= 0 &&
        (v.cell as number) < c.rows * c.cols &&
        typeof v.on === "boolean"
        ? { cell: v.cell as number, on: v.on }
        : undefined;
    case "holdToConfirm":
      return v === true ? true : undefined;
    case "colorPicker":
      return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : undefined;
    case "label":
    case "meter":
      // Display-only: values come from the installation, never from a device.
      return undefined;
  }
}
