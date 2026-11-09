/**
 * Contract parameter → draft config control (ADR-017). The studio redraws the final pult in Figma
 * (ADR-014); this only picks a sensible first control per parameter.
 */
import { type AnyControl } from "@osc/schema";
import { priorityOf, type ContractParameter, type ParameterPriority } from "@osc/contract";

/** How a control takes room in the draft grid. */
export type Shape = "half" | "full" | "stretch";

export interface DraftControl {
  control: Record<string, unknown>;
  shape: Shape;
  priority: ParameterPriority;
  group: string;
  param: ContractParameter;
}

export interface MapIssue {
  level: "warning" | "info";
  code: string;
  message: string;
}

/** `/wall/intensity` → `wall-intensity`; `/cue/{index}` → `cue`. */
export function controlId(address: string): string {
  const id = address
    .toLowerCase()
    .replace(/\{[a-z]+\}/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
  return id || "param";
}

/** Enum with this many options or fewer → segmented; more → a list (sceneList). */
export const SEGMENTED_MAX = 4;

const range = (p: ContractParameter) => ({
  min: p.min ?? 0,
  max: p.max ?? (p.type === "int" ? 100 : 1),
});

/**
 * The draft control for one parameter: `hint` when it is a control the parameter can drive,
 * otherwise by `type` (float → fader, bool → toggle, trigger → button, dangerous trigger →
 * holdToConfirm, enum → segmented or list by option count, color → colorPicker, xy → xy).
 */
export function controlFor(p: ContractParameter, id: string, issues: MapIssue[]): DraftControl {
  const priority = priorityOf(p);
  const group = p.group?.trim() || "General";
  const base = { id, label: p.label };
  const note = (code: string, message: string, level: MapIssue["level"] = "info") =>
    issues.push({ level, code, message: `${p.address}: ${message}` });
  const out = (control: Record<string, unknown>, shape: Shape): DraftControl => ({
    control,
    shape,
    priority,
    group,
    param: p,
  });
  const hint = p.hint;
  const lock = p.dangerous ? { lock: true } : {};

  switch (p.type) {
    case "float":
    case "int": {
      const r = range(p);
      if (r.max <= r.min) {
        note("bad-range", `max ${r.max} ≤ min ${r.min}; using 0..1`, "warning");
        r.min = 0;
        r.max = 1;
      }
      const ranged = {
        ...base,
        address: p.address,
        ...r,
        ...(typeof p.default === "number" ? { default: p.default } : {}),
        ...(p.curve ? { curve: p.curve } : {}),
        ...(p.unit ? { unit: p.unit } : {}),
        ...(p.type === "int" ? { int: true, step: 1 } : {}),
        ...lock,
      };
      if (p.dangerous)
        note("dangerous-ranged", "dangerous: drafted with lock (long-press to unlock)");
      if (hint === "knob") return out({ ...ranged, type: "knob" }, "half");
      if (hint && hint !== "fader")
        note("hint-ignored", `hint "${hint}" does not fit ${p.type}; fader`);
      return out({ ...ranged, type: "fader", orientation: "horizontal" }, "full");
    }
    case "bool": {
      if (hint === "holdToConfirm" || hint === "button")
        note("hint-ignored", `hint "${hint}" does not fit bool; toggle`);
      if (p.dangerous) note("dangerous-toggle", "dangerous: drafted as a locked toggle");
      // Live switches are big pads; tuning switches are compact hardware-style switches.
      const style = priority === "live" ? "button" : "switch";
      return out(
        {
          ...base,
          type: "toggle",
          address: p.address,
          style,
          ...(style === "button" ? { size: "regular" } : {}),
          ...(p.default === true ? { default: true } : {}),
          ...lock,
        },
        "half",
      );
    }
    case "trigger": {
      if (p.address.includes("{") || (p.count ?? 1) > 1 || hint === "buttonGrid") {
        const n = p.count ?? 1;
        if (!p.count) note("grid-count", "template without count; drafted as one cell", "warning");
        const cols = Math.min(n, 4);
        return out(
          {
            ...base,
            type: "buttonGrid",
            address: p.address.includes("{") ? p.address : `${p.address}/{index}`,
            rows: Math.min(16, Math.ceil(n / cols)),
            cols,
          },
          "stretch",
        );
      }
      if (p.dangerous || hint === "holdToConfirm")
        return out({ ...base, type: "holdToConfirm", address: p.address }, "half");
      return out({ ...base, type: "button", address: p.address, size: "regular" }, "half");
    }
    case "enum": {
      const options = p.options ?? [];
      if (options.length < 2) {
        note("enum-options", "enum with fewer than 2 options; drafted as a toggle", "warning");
        return out({ ...base, type: "toggle", address: p.address, style: "switch" }, "half");
      }
      const list = hint === "sceneList" || (hint !== "segmented" && options.length > SEGMENTED_MAX);
      if (list || options.length > 8)
        return out(
          {
            ...base,
            type: "sceneList",
            address: p.address,
            scenes: options.map((o, i) => ({
              id: controlId(`/${String(o.value)}`) || `s${i}`,
              label: o.label || String(o.value),
              value: o.value,
            })),
          },
          "stretch",
        );
      const def = options.findIndex((o) => o.value === p.default);
      return out(
        {
          ...base,
          type: "segmented",
          address: p.address,
          options: options.map((o) => ({ label: o.label || String(o.value), value: o.value })),
          ...(def > 0 ? { default: def } : {}),
          ...lock,
        },
        "full",
      );
    }
    case "xy": {
      const r = range(p);
      return out(
        {
          ...base,
          type: "xy",
          address: p.address,
          x: { ...r },
          y: { ...r },
        },
        "stretch",
      );
    }
    case "color":
      return out(
        {
          ...base,
          type: "colorPicker",
          address: p.address,
          ...(p.colorFormat && p.colorFormat !== "hsb" ? { format: p.colorFormat } : {}),
          ...(p.hueRange === "unit" ? { hueRange: "unit" } : {}),
        },
        "stretch",
      );
    case "string":
      note("string-prompt", "string drafted as a prompt without blending; check with the studio");
      return out({ ...base, type: "prompt", address: p.address, blend: false }, "stretch");
  }
}

/** Shapes of controls already in a config (capacity table, plans of existing pults). */
export function shapeOf(c: AnyControl): Shape {
  switch (c.type) {
    case "toggle":
    case "button":
    case "holdToConfirm":
    case "knob":
      return "half";
    case "fader":
      return c.orientation === "horizontal" ? "full" : "stretch";
    case "segmented":
    case "label":
    case "buttonGroup":
    case "gyroscope":
      return "full";
    default:
      return "stretch";
  }
}
