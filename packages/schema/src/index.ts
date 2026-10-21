import { isValidAddress } from "@osc/core";
import { checkBrand } from "@osc/tokens";
import { z } from "zod";

/**
 * Installation config — the "build" a client receives after login.
 * Published by the studio from the builder as a numbered revision; rendered by the app,
 * the local web pult (served by the bridge) and the cloud web pult. Platform-agnostic.
 */
export const SCHEMA_VERSION = 1;

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "ids: letters, digits, - and _, max 64");
const hex = z.string().regex(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i, "hex colour like #C6FF3D");
const address = z
  .string()
  .refine(isValidAddress, "OSC address must start with / and contain no spaces or # * , ? [ ] { }");
/** `/scene/{index}` style templates are allowed; `{…}` is filled at send time. */
const addressTemplate = z
  .string()
  .refine((a) => isValidAddress(a.replace(/\{[a-z]+\}/gi, "x")), "OSC address template is invalid");
const oscValue = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const Target = z.object({
  id,
  name: z.string().min(1),
  protocol: z.enum(["udp", "tcp"]).default("udp"),
  /** "auto" = discover via the bridge / mDNS. */
  host: z.union([z.literal("auto"), z.string().min(1)]).default("auto"),
  port: z.number().int().min(1).max(65535),
  fallbackHosts: z.array(z.string()).default([]),
  feedbackPort: z.number().int().min(1).max(65535).optional(),
});

export const Theme = z
  .object({
    mode: z.enum(["dark", "light"]).default("dark"),
    primary: hex.optional(),
    onPrimary: hex.optional(),
    accent: hex.optional(),
    background: hex.optional(),
    surface: hex.optional(),
    font: z.string().optional(),
    /** Asset paths relative to the config's asset bundle. */
    logo: z.string().optional(),
    icon: z.string().optional(),
  })
  .superRefine((t, ctx) => {
    for (const issue of checkBrand(t)) {
      if (issue.level === "error")
        ctx.addIssue({ code: "custom", path: [issue.token], message: issue.message });
    }
  });

export const Grid = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1),
});

const curve = z.enum(["linear", "log", "exp"]);

const base = {
  id,
  label: z.string().optional(),
  target: id.optional(),
  grid: Grid,
  /** Prevents accidental touches: control unlocks on long-press. */
  lock: z.boolean().default(false),
  /** Service controls visible only in studio sessions. */
  studioOnly: z.boolean().default(false),
  /** Address the installation sends state back on; defaults to the control's own address. */
  feedback: address.optional(),
};

const ranged = {
  address,
  min: z.number().default(0),
  max: z.number().default(1),
  step: z.number().positive().optional(),
  curve: curve.default("linear"),
  invert: z.boolean().default(false),
  throttleHz: z.number().min(1).max(240).default(60),
  sendOn: z.enum(["change", "release"]).default("change"),
  default: z.number().optional(),
  /** Integer instead of float on the wire. */
  int: z.boolean().default(false),
  /** Double-tap returns the control to `default` (or its initial value). */
  doubleTapReset: z.boolean().default(true),
  /** Two-finger drag moves this many times slower for precise adjustment. */
  fineFactor: z.number().min(0.01).max(1).default(0.2),
};

export const Button = z.object({
  ...base,
  type: z.literal("button"),
  address,
  /** Values sent on press / release. `release: undefined` sends nothing on release. */
  press: z.array(oscValue).default([1]),
  release: z.array(oscValue).optional().default([0]),
  icon: z.string().optional(),
});

export const Toggle = z.object({
  ...base,
  type: z.literal("toggle"),
  address,
  on: z.array(oscValue).default([1]),
  off: z.array(oscValue).default([0]),
  default: z.boolean().default(false),
});

export const Fader = z.object({
  ...base,
  ...ranged,
  type: z.literal("fader"),
  /**
   * relative (default, safe): a touch never changes the value, only dragging moves it by the
   * distance dragged. absolute: the value jumps to the finger — opt in for non-critical parameters.
   */
  response: z.enum(["relative", "absolute"]).default("relative"),
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  /** Draw fill from the centre (bipolar values like pan). */
  centered: z.boolean().default(false),
  showValue: z.boolean().default(true),
  unit: z.string().optional(),
});

export const Knob = z.object({
  ...base,
  ...ranged,
  type: z.literal("knob"),
  /** Endless encoder sends relative steps instead of absolute values. */
  endless: z.boolean().default(false),
  centered: z.boolean().default(false),
  showValue: z.boolean().default(true),
  unit: z.string().optional(),
});

export const XYPad = z.object({
  ...base,
  type: z.literal("xy"),
  address,
  x: z
    .object({ min: z.number().default(0), max: z.number().default(1) })
    .default({ min: 0, max: 1 }),
  y: z
    .object({ min: z.number().default(0), max: z.number().default(1) })
    .default({ min: 0, max: 1 }),
  /** Spring back to centre on release. */
  springBack: z.boolean().default(false),
  throttleHz: z.number().min(1).max(240).default(60),
});

const option = z.object({ label: z.string().min(1), value: oscValue });

export const Segmented = z.object({
  ...base,
  type: z.literal("segmented"),
  address,
  options: z.array(option).min(2).max(8),
  default: z.number().int().min(0).default(0),
});

export const ButtonGrid = z.object({
  ...base,
  type: z.literal("buttonGrid"),
  /** Template; `{row}`, `{col}` and `{index}` are filled per cell. */
  address: addressTemplate,
  rows: z.number().int().min(1).max(16),
  cols: z.number().int().min(1).max(16),
  mode: z.enum(["momentary", "toggle", "radio"]).default("momentary"),
  labels: z.array(z.string()).optional(),
});

export const SceneList = z.object({
  ...base,
  type: z.literal("sceneList"),
  address,
  scenes: z
    .array(
      z.object({ id, label: z.string().min(1), value: oscValue, thumbnail: z.string().optional() }),
    )
    .min(1),
  /** Optional crossfade time sent as a second argument, in seconds. */
  crossfade: z.number().min(0).optional(),
});

export const Label = z.object({
  ...base,
  type: z.literal("label"),
  text: z.string().default(""),
  /** If set, the text is replaced by values received on this address. */
  feedback: address.optional(),
  format: z.string().optional(),
  size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
});

export const Meter = z.object({
  ...base,
  type: z.literal("meter"),
  feedback: address,
  min: z.number().default(0),
  max: z.number().default(1),
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  /** Thresholds switch colour to warning / critical status tokens. */
  warnAt: z.number().optional(),
  criticalAt: z.number().optional(),
});

export const HoldToConfirm = z.object({
  ...base,
  type: z.literal("holdToConfirm"),
  address,
  args: z.array(oscValue).default([1]),
  holdMs: z.number().int().min(500).max(5000).default(1500),
  tone: z.enum(["default", "critical"]).default("critical"),
});

export const ColorPicker = z.object({
  ...base,
  type: z.literal("colorPicker"),
  address,
  format: z.enum(["rgbFloat", "rgbInt", "hsvFloat", "hex"]).default("rgbFloat"),
  default: hex.optional(),
  /** Restrict to a palette (e.g. the client's brand colours). */
  swatches: z.array(hex).optional(),
});

export const Control = z.discriminatedUnion("type", [
  Button,
  Toggle,
  Fader,
  Knob,
  XYPad,
  Segmented,
  ButtonGrid,
  SceneList,
  Label,
  Meter,
  HoldToConfirm,
  ColorPicker,
]);

export const CONTROL_TYPES = Control.options.map((o) => o.shape.type.value);

/**
 * A control type this app version does not know (added in a newer release).
 * The renderer shows an "Update the app" placeholder in its grid cell; the rest of the pult keeps working.
 */
export const UnsupportedControl = z
  .looseObject({
    id,
    type: z.string().refine((t) => !(CONTROL_TYPES as string[]).includes(t)),
    grid: Grid,
  })
  .transform((c) => ({
    id: c.id,
    grid: c.grid,
    type: "unsupported" as const,
    originalType: c.type,
  }));

export const AnyControl = z.union([Control, UnsupportedControl]);

export const Page = z.object({
  id,
  title: z.string().min(1),
  columns: z.literal(12).default(12),
  controls: z.array(AnyControl),
});

/** A pult is one control surface inside an installation (e.g. "Lobby", "Conference hall"). */
export const Pult = z.object({
  id,
  name: z.string().min(1),
  defaultTarget: id.optional(),
  pages: z.array(Page).min(1),
});

export const InstallationConfig = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    installation: z.object({
      id,
      name: z.string().min(1),
      revision: z.number().int().min(1),
      publishedAt: z.iso.datetime().optional(),
    }),
    targets: z.array(Target).min(1),
    theme: Theme.default({ mode: "dark" }),
    pults: z.array(Pult).min(1),
  })
  .superRefine((cfg, ctx) => {
    const targets = new Set(cfg.targets.map((t) => t.id));
    const seen = new Set<string>();
    cfg.pults.forEach((pult, pi) => {
      if (pult.defaultTarget && !targets.has(pult.defaultTarget))
        ctx.addIssue({
          code: "custom",
          path: ["pults", pi, "defaultTarget"],
          message: `Unknown target "${pult.defaultTarget}"`,
        });
      pult.pages.forEach((page, gi) =>
        page.controls.forEach((c, ci) => {
          const path = ["pults", pi, "pages", gi, "controls", ci];
          const key = `${pult.id}/${c.id}`;
          if (seen.has(key))
            ctx.addIssue({
              code: "custom",
              path: [...path, "id"],
              message: `Duplicate control id "${c.id}" in pult "${pult.id}"`,
            });
          seen.add(key);
          if (c.type === "unsupported") return;
          const t =
            c.target ??
            pult.defaultTarget ??
            (cfg.targets.length === 1 ? cfg.targets[0]!.id : undefined);
          if (c.type !== "label" && c.type !== "meter" && !t)
            ctx.addIssue({
              code: "custom",
              path: [...path, "target"],
              message: "Control needs a target (or set pult.defaultTarget)",
            });
          if (c.target && !targets.has(c.target))
            ctx.addIssue({
              code: "custom",
              path: [...path, "target"],
              message: `Unknown target "${c.target}"`,
            });
          if (c.grid.x + c.grid.w > page.columns)
            ctx.addIssue({
              code: "custom",
              path: [...path, "grid"],
              message: "Control overflows the 12-column grid",
            });
          if ("min" in c && "max" in c && typeof c.min === "number" && c.max <= c.min)
            ctx.addIssue({
              code: "custom",
              path: [...path, "max"],
              message: "max must be greater than min",
            });
        }),
      );
    });
  });

export type Target = z.infer<typeof Target>;
export type Theme = z.infer<typeof Theme>;
export type Control = z.infer<typeof Control>;
export type UnsupportedControl = z.infer<typeof UnsupportedControl>;
export type AnyControl = z.infer<typeof AnyControl>;
export type ControlType = Control["type"];
export type ControlOf<T extends ControlType> = Extract<Control, { type: T }>;
export type Page = z.infer<typeof Page>;
export type Pult = z.infer<typeof Pult>;
export type InstallationConfig = z.infer<typeof InstallationConfig>;
export type InstallationConfigInput = z.input<typeof InstallationConfig>;

export type ParseResult =
  | { ok: true; config: InstallationConfig }
  | { ok: false; reason: "newer-schema"; schemaVersion: number }
  | { ok: false; reason: "invalid"; issues: { path: string; message: string }[] };

/**
 * Parse a config received from the backend or the bridge.
 * A newer schema is reported separately so the app can stay on its cached revision and ask for an update.
 */
export function parseConfig(input: unknown): ParseResult {
  const v = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof v === "number" && v > SCHEMA_VERSION)
    return { ok: false, reason: "newer-schema", schemaVersion: v };
  const r = InstallationConfig.safeParse(input);
  if (r.success) return { ok: true, config: r.data };
  return {
    ok: false,
    reason: "invalid",
    issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

/** Resolve which target a control sends to. */
export function targetOf(
  cfg: InstallationConfig,
  pult: Pult,
  control: AnyControl,
): Target | undefined {
  if (control.type === "unsupported") return undefined;
  const tid =
    control.target ??
    pult.defaultTarget ??
    (cfg.targets.length === 1 ? cfg.targets[0]!.id : undefined);
  return cfg.targets.find((t) => t.id === tid);
}
