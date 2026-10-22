/**
 * Figma instances → schema controls, for one pult frame (one page × one form factor).
 * Pure TS with no Node or Figma APIs: shared by the CLI and the Otakoyi Inspector plugin.
 */
import {
  ID_PLACEHOLDER,
  expandRange,
  parseDependsOn,
  parseOsc,
  plain,
  type AddressSpec,
  type DependsOn,
  type OscSpec,
} from "./annotations";
import { DECORATIVE_ICONS, PANEL_PATTERNS, roleOf } from "./components";
import { findFirst, textOf, walk, type FNode } from "./snapshot";

export type Level = "error" | "warning" | "info";

export interface Issue {
  level: Level;
  code: string;
  message: string;
  /** Figma node the issue is about. */
  nodeId?: string;
  /** `<form factor>/<page>` or a frame name. */
  where?: string;
}

/** A control as it goes into the config (before zod defaults). */
export type RawControl = { id: string; type: string } & Record<string, unknown>;

export interface FoundControl {
  control: RawControl;
  /** The instance the control came from. */
  nodeId: string;
  component: string;
  box?: [number, number, number, number];
  /** Node whose OSC annotation gave the address (the instance or a container around it). */
  oscFrom?: string;
  /** How the id was chosen. */
  idFrom: "layer" | "label" | "panel" | "component";
  /** `deferMissing`: the control has no address yet; the issue to report if nothing supplies one. */
  missing?: Issue;
}

/** A Console-Panel pattern instance around controls (page `panels`, ADR-014). */
export interface FoundPanel {
  id: string;
  idFrom: "layer" | "title" | "pattern";
  title?: string;
  /** Schema `PanelPattern`. */
  pattern: string;
  nodeId: string;
  component: string;
  box?: [number, number, number, number];
  /** The controls inside, in frame order (the same objects as in `controls`). */
  controls: FoundControl[];
}

export interface FrameResult {
  controls: FoundControl[];
  /** Panels with at least one control. */
  panels: FoundPanel[];
  issues: Issue[];
  /** Annotated nodes whose OSC annotation is marked draft. */
  drafts: { nodeId: string; name: string }[];
}

const MIC_OUTPUTS = ["level", "bands", "beat"];

/** Lowercase id: letters, digits, `-`, max 64 (schema `id`). */
export function slug(s: string): string {
  return plain(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** "PROMPTS" → "Prompts"; other text is kept as written. */
function humanize(s: string): string {
  const t = s.trim();
  if (t.length > 1 && t === t.toUpperCase() && /[A-Z]/.test(t))
    return t[0] + t.slice(1).toLowerCase();
  return t;
}

function lower(v: unknown): string | undefined {
  return typeof v === "string" ? v.toLowerCase() : undefined;
}

function num(s: unknown): number | undefined {
  if (typeof s !== "string") return undefined;
  const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(plain(s));
  return m ? Number(m[1]) : undefined;
}

/** Annotation texts of a node: Dev Mode annotations plus the Inspector's shared plugin data. */
export function annotationTexts(node: FNode): { osc?: string; dependsOn?: string } {
  const osc: string[] = [];
  const dep: string[] = [];
  for (const a of node.annotations ?? []) {
    const c = (a.category ?? "").toLowerCase();
    if (c === "osc") osc.push(a.text);
    else if (c === "depends on") dep.push(a.text);
  }
  if (!osc.length && node.plugin?.osc) osc.push(node.plugin.osc);
  if (!dep.length && node.plugin?.dependsOn) dep.push(node.plugin.dependsOn);
  return {
    osc: osc.length ? osc.join("\n") : undefined,
    dependsOn: dep.length ? dep.join("\n") : undefined,
  };
}

/** An OSC annotation being handed out to the controls under the node that carries it. */
interface Annot {
  nodeId: string;
  name: string;
  osc?: OscSpec;
  dependsOn?: DependsOn;
  used: Set<number>;
  /** Next index per `{a–b}` template entry. */
  next: Map<number, number>;
  /** Entries filled with a control id (`{knob-id}`), reusable. */
  templated: Set<number>;
}

interface Scope {
  annot?: Annot;
  panelTitle?: string;
  sceneBar?: boolean;
  panel?: FoundPanel;
}

type Kind =
  | "fader"
  | "knob"
  | "toggle"
  | "button"
  | "holdToConfirm"
  | "segmented"
  | "sceneList"
  | "xy"
  | "thumbstick"
  | "buttonGroup"
  | "buttonGrid"
  | "mic"
  | "prompt"
  | "meter"
  | "label"
  | "colorPicker"
  | "image";

function compatible(kind: Kind, e: AddressSpec): boolean {
  const untyped = !e.type && !e.values && !e.options && !e.range && !e.pair;
  switch (kind) {
    case "toggle":
    case "button":
    case "holdToConfirm":
    case "buttonGroup":
    case "buttonGrid":
      return untyped || !!e.values || e.type === "bool";
    case "fader":
    case "knob":
      return (
        untyped ||
        (!e.pair &&
          !e.options &&
          (e.type === "float" || e.type === "int" || !!e.range) &&
          !e.values)
      );
    case "xy":
    case "thumbstick":
      return untyped || !!e.pair;
    case "segmented":
    case "sceneList":
      return (
        untyped || !!e.options || (e.type === "int" && !!e.range) || (e.values?.length ?? 0) > 1
      );
    case "prompt":
      return untyped || e.type === "string";
    default:
      return true;
  }
}

function makeAnnot(node: FNode): Annot | undefined {
  const t = annotationTexts(node);
  if (!t.osc && !t.dependsOn) return undefined;
  return {
    nodeId: node.id,
    name: node.name,
    osc: t.osc ? parseOsc(t.osc) : undefined,
    dependsOn: t.dependsOn ? parseDependsOn(t.dependsOn) : undefined,
    used: new Set(),
    next: new Map(),
    templated: new Set(),
  };
}

/** Take the next address for a control of `kind` from an annotation. */
function take(
  a: Annot | undefined,
  kind: Kind,
  id: string,
): { address: string; entry: AddressSpec } | undefined {
  if (!a?.osc) return undefined;
  const entries = a.osc.entries;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (!compatible(kind, e)) continue;
    const expanded = expandRange(e.address);
    if (expanded) {
      const n = a.next.get(i) ?? 0;
      if (n >= expanded.length) continue;
      a.next.set(i, n + 1);
      a.used.add(i);
      return { address: expanded[n]!, entry: e };
    }
    if (ID_PLACEHOLDER.test(e.address)) {
      a.used.add(i);
      a.templated.add(i);
      return { address: e.address.replace(ID_PLACEHOLDER, id), entry: e };
    }
    if (a.used.has(i)) continue;
    a.used.add(i);
    return { address: e.address, entry: e };
  }
  return undefined;
}

function isDefaultName(node: FNode): boolean {
  return (
    !node.component || node.name === node.component || /^(Frame|Group|Instance)\b/.test(node.name)
  );
}

/** A TEXT layer of the component itself (not of an instance nested in it). */
function ownText(node: FNode, layerName: string): string | undefined {
  let found: string | undefined;
  walk(node, (n) => {
    if (found !== undefined) return false;
    if (n !== node && n.type === "INSTANCE") return false;
    if (n.type === "TEXT" && n.name === layerName) found = n.text;
  });
  return found;
}

function labelOf(node: FNode): string | undefined {
  const p = node.props ?? {};
  const panel = node.children?.find((c) => c.component === "Console Panel")?.props?.Title;
  const raw =
    (typeof p.Label === "string" && p.Label) ||
    (typeof p.Title === "string" && p.Title) ||
    ownText(node, "Label") ||
    ownText(node, "Title") ||
    (typeof panel === "string" && panel);
  if (!raw) return undefined;
  // Group Button shows its state as the label ("ON" / "OFF"); that is not a name.
  if (node.component === "Group Button" && /^(on|off)$/i.test(raw.trim()))
    return isDefaultName(node) ? undefined : node.name;
  return humanize(raw);
}

/** Option labels drawn in a Segmented's `Options` frame: texts, else icon names. */
function optionCells(
  node: FNode,
): { text?: string; icon?: string; iconName?: string; on?: boolean }[] {
  const opts = findFirst(node, (n) => n.name === "Options" && n.type !== "TEXT");
  return (opts?.children ?? []).map((cell) => {
    const text = findFirst(cell, (n) => n.type === "TEXT")?.text;
    const icon = findFirst(cell, (n) => !!n.component?.startsWith("Icon/"))?.component;
    return {
      text,
      icon: icon
        ? humanize(icon.slice(5).replace(/-/g, " ")).replace(/^./, (c) => c.toUpperCase())
        : undefined,
      iconName: icon ? iconSlug(icon) : undefined,
    };
  });
}

/** `Icon/device-mobile` → `device-mobile` (Phosphor kebab name, schema `icon`). */
function iconSlug(component: string): string | undefined {
  const n = slug(component.replace(/^Icon\//, ""));
  return /^[a-z][a-z0-9-]*$/.test(n) ? n : undefined;
}

/**
 * The control's own icon: the first `Icon/<name>` instance in it that is not inside another
 * nested component and not one of the component's own glyphs (relative ↻, jog − / +, chevrons).
 */
export function iconOf(node: FNode): string | undefined {
  let found: string | undefined;
  walk(node, (n) => {
    if (found) return false;
    if (n === node) return;
    if (n.type === "INSTANCE" && n.component?.startsWith("Icon/")) {
      const name = iconSlug(n.component);
      if (name && !DECORATIVE_ICONS.has(name)) found = name;
      return false;
    }
    if (n.type === "INSTANCE") return false;
  });
  return found;
}

function applyKeys(c: RawControl, keys: Record<string, string>, allowed: string[]): void {
  for (const k of allowed) {
    const v = keys[k];
    if (v === undefined) continue;
    if (v === "true" || v === "false") c[k] = v === "true";
    else if (Number.isFinite(Number(v))) c[k] = Number(v);
    else c[k] = v;
  }
}

export interface MapOptions {
  where?: string;
  /**
   * Keep controls without an address in `controls` (with `missing` set) instead of reporting them:
   * the exporter merges phone and tablet first, so annotating one form factor is enough.
   */
  deferMissing?: boolean;
}

/**
 * Map the instances under `body` (a pult frame or the part of it that holds controls).
 * Chrome is skipped, containers are entered, controls are built; ids are unique within the frame.
 */
export function mapFrame(body: FNode, opts: MapOptions = {}): FrameResult {
  const where = opts.where;
  const issues: Issue[] = [];
  const controls: FoundControl[] = [];
  const panels: FoundPanel[] = [];
  const annots: Annot[] = [];
  const promptMixes: { node: FNode; annot?: Annot }[] = [];
  const issue = (level: Level, code: string, message: string, nodeId?: string) =>
    issues.push({ level, code, message, nodeId, where });

  const scopeFor = (node: FNode, scope: Scope): Scope => {
    const next: Scope = { ...scope };
    const a = makeAnnot(node);
    if (a) {
      annots.push(a);
      next.annot = a;
    }
    if (node.component === "Console Panel" && typeof node.props?.Title === "string") {
      next.panelTitle = node.props.Title;
      if (next.panel && !next.panel.title) next.panel.title = humanize(node.props.Title);
    }
    if (node.component === "Scene Bar") next.sceneBar = true;
    return next;
  };

  const idFor = (node: FNode, label: string | undefined, scope: Scope) => {
    if (!isDefaultName(node) && slug(node.name))
      return { id: slug(node.name), idFrom: "layer" as const };
    if (label && slug(label)) return { id: slug(label), idFrom: "label" as const };
    if (scope.panelTitle && slug(scope.panelTitle))
      return { id: slug(scope.panelTitle), idFrom: "panel" as const };
    return { id: slug(node.component ?? node.name) || "control", idFrom: "component" as const };
  };

  const build = (node: FNode, type: string, scope: Scope) => {
    const own = makeAnnot(node);
    if (own) annots.push(own);
    const annot = own ?? scope.annot;
    const label = labelOf(node);
    const { id, idFrom } = idFor(node, label, scope);
    const p = node.props ?? {};
    let kind = type as Kind;
    if (kind === "segmented" && scope.sceneBar) kind = "sceneList";
    const c: RawControl = { id, type: kind };
    if (label) c.label = label;
    const osc = annot?.osc;
    const keys = osc?.keys ?? {};
    const push = (oscFrom?: string) => {
      const cond = annot?.dependsOn?.conditions;
      if (cond?.length) c.enabledWhen = cond.map((x) => ({ ...x }));
      const found: FoundControl = {
        control: c,
        nodeId: node.id,
        component: node.component ?? "?",
        box: node.box,
        oscFrom,
        idFrom,
      };
      controls.push(found);
      scope.panel?.controls.push(found);
    };
    const missing = (what = "no OSC address") => {
      const i: Issue = {
        level: "error",
        code: "missing-address",
        message: `${id} (${node.component}${p.Mode ? ` Mode=${String(p.Mode)}` : ""}): ${what} — add an "OSC" annotation to the instance or its container`,
        nodeId: node.id,
        where,
      };
      if (opts.deferMissing) {
        const found: FoundControl = {
          control: c,
          nodeId: node.id,
          component: node.component ?? "?",
          box: node.box,
          idFrom,
          missing: i,
        };
        controls.push(found);
        scope.panel?.controls.push(found);
      } else issues.push(i);
    };
    const need = (): { address: string; entry: AddressSpec } | undefined => {
      const got = take(annot, kind, id);
      if (!got) missing();
      return got;
    };

    switch (kind) {
      case "fader":
      case "knob": {
        const got = need();
        if (!got) return;
        c.address = got.address;
        const mode = lower(p.Mode);
        if (kind === "fader") {
          if (mode && mode !== "absolute") c.mode = mode;
          const o = lower(p.Orientation);
          if (o === "horizontal") c.orientation = o;
        } else {
          if (mode === "relative") c.mode = "relative";
          if (mode === "color" || mode === "hue") c.mode = "hue";
          if (lower(p.Size) === "compact") c.size = "compact";
          if (osc?.degrees && osc.degrees !== 240) c.travel = osc.degrees;
        }
        const r = got.entry.range;
        if (r && c.mode !== "hue") {
          if (r[0] !== 0) c.min = r[0];
          if (r[1] !== 1) c.max = r[1];
        }
        if (got.entry.type === "int") c.int = true;
        if (osc?.rateHz && osc.rateHz !== 60) c.throttleHz = osc.rateHz;
        const v = num(p.Value);
        const [lo, hi] = r ?? [0, 1];
        if (
          keys.default === undefined &&
          v !== undefined &&
          (c.mode ?? "absolute") === "absolute"
        ) {
          if (v >= lo && v <= hi) c.default = v;
          else
            issue(
              "info",
              "default-out-of-range",
              `${id}: Figma value ${String(p.Value)} is outside ${lo}–${hi}; no default exported`,
              node.id,
            );
        }
        applyKeys(c, keys, [
          "min",
          "max",
          "step",
          "curve",
          "default",
          "unit",
          "target",
          "lock",
          "studioOnly",
          "feedback",
          "response",
          "invert",
          "sendOn",
        ]);
        return push(annot?.nodeId);
      }
      case "toggle":
      case "button":
      case "holdToConfirm": {
        if (node.component === "List Row" && p.Trailing !== "Switch") return; // a plain list row
        const got = need();
        if (!got) return;
        c.address = got.address;
        const vals = got.entry.values;
        const icon = iconOf(node);
        if (icon) c.icon = icon;
        if (kind === "toggle") {
          if (node.component === "Switch" || node.component === "List Row") c.style = "switch";
          if (node.component === "Group Button") c.style = "led";
          const state =
            lower(p.State) ?? lower(findFirst(node, (n) => n.component === "Switch")?.props?.State);
          if (state === "on") c.default = true;
          if (vals && vals.length >= 1 && vals[0] !== 1) c.on = [vals[0]];
          if (vals && vals.length >= 2 && vals[1] !== 0) c.off = [vals[1]];
        } else if (kind === "button") {
          if (vals && vals.length >= 1 && vals[0] !== 1) c.press = [vals[0]];
        } else if (vals && vals.length >= 1 && vals[0] !== 1) c.args = [vals[0]];
        const size = lower(p.Size);
        if (
          (kind === "toggle" || kind === "button") &&
          (size === "regular" || size === "compact") &&
          c.style !== "switch"
        )
          c.size = size;
        applyKeys(c, keys, ["target", "lock", "studioOnly", "feedback", "holdMs", "tone"]);
        return push(annot?.nodeId);
      }
      case "segmented":
      case "sceneList": {
        const got = need();
        if (!got) return;
        c.address = got.address;
        const cells = optionCells(node);
        const e = got.entry;
        let values: (string | number)[] = [];
        if (e.options?.length) values = e.options;
        else if (e.range && e.type === "int")
          for (let i = e.range[0]; i <= e.range[1]; i++) values.push(i);
        else if (e.values) values = e.values;
        if (!values.length) {
          issue(
            "error",
            "missing-options",
            `${id}: the OSC annotation lists no option values`,
            node.id,
          );
          return;
        }
        if (cells.length && cells.length !== values.length)
          issue(
            "warning",
            "option-count",
            `${id}: ${cells.length} options in Figma, ${values.length} values in the OSC annotation (${values.join(", ")}); exported ${values.length}`,
            node.id,
          );
        const labels = values.map((v, i) => {
          const cell = cells[i];
          if (cell?.text) return humanize(cell.text);
          if (typeof v === "string") return v[0]!.toUpperCase() + v.slice(1);
          return cell?.icon ?? `${kind === "sceneList" ? "Scene" : "Option"} ${v}`;
        });
        if (cells.length && cells.every((x) => !x.text))
          issue(
            "info",
            "icon-options",
            `${id}: icon-only options; labels derived (${labels.join(", ")}) — the app needs text for accessibility`,
            node.id,
          );
        if (kind === "segmented")
          c.options = values.map((v, i) => {
            const icon = cells[i]?.iconName;
            return { label: labels[i], value: v, ...(icon ? { icon } : {}) };
          });
        else {
          c.scenes = values.map((v, i) => ({
            id: slug(String(labels[i])) || `scene-${i + 1}`,
            label: labels[i],
            value: v,
          }));
          if (typeof osc?.crossfade === "number") c.crossfade = osc.crossfade;
          else if (osc?.crossfade)
            issue(
              "info",
              "crossfade-seconds",
              `${id}: crossfade mentioned without seconds (add crossfade=<s>); not exported`,
              node.id,
            );
        }
        applyKeys(c, keys, ["target", "lock", "studioOnly", "feedback", "default"]);
        return push(annot?.nodeId);
      }
      case "xy":
      case "thumbstick": {
        const got = need();
        if (!got) return;
        c.address = got.address;
        const r = got.entry.range;
        if (kind === "xy") {
          if (r && (r[0] !== 0 || r[1] !== 1)) {
            c.x = { min: r[0], max: r[1] };
            c.y = { min: r[0], max: r[1] };
          }
          if (osc?.springBack) c.springBack = true;
          if (osc?.rateHz && osc.rateHz !== 60) c.throttleHz = osc.rateHz;
        } else {
          if (r && (r[0] !== -1 || r[1] !== 1))
            issue(
              "warning",
              "thumbstick-range",
              `${id}: a thumbstick always sends −1…1; annotation says ${r[0]}–${r[1]}`,
              node.id,
            );
          if (osc?.rateHz && osc.rateHz !== 30) c.rateHz = osc.rateHz;
          applyKeys(c, keys, ["deadzone", "press"]);
        }
        applyKeys(c, keys, ["target", "lock", "studioOnly", "feedback"]);
        return push(annot?.nodeId);
      }
      case "buttonGroup": {
        const buttons: Record<string, unknown>[] = [];
        const on: string[] = [];
        walk(node, (n) => {
          if (n === node) return;
          if (n.component !== "Group Button") return;
          const bl = typeof n.props?.Label === "string" ? n.props.Label : textOf(n, "Label");
          const bid = slug((!isDefaultName(n) && n.name) || bl || `button-${buttons.length + 1}`);
          const got = take(annot, "buttonGroup", bid);
          if (!got) {
            issue("error", "missing-address", `${id}/${bid} (Group Button): no OSC address`, n.id);
            return false;
          }
          const b: Record<string, unknown> = { id: bid, label: humanize(bl ?? bid) };
          if (n.props?.showCaption !== false && typeof n.props?.Caption === "string")
            b.caption = humanize(n.props.Caption);
          b.address = got.address;
          const v = got.entry.values?.[0];
          if (v !== undefined && v !== 1) b.value = v;
          if (lower(n.props?.State) === "on") on.push(bid);
          buttons.push(b);
          return false;
        });
        if (!buttons.length) {
          issue(
            "error",
            "empty-button-group",
            `${id}: Button Group without Group Buttons`,
            node.id,
          );
          return;
        }
        c.buttons = buttons;
        if (on.length) c.default = on;
        applyKeys(c, keys, ["target", "lock", "studioOnly"]);
        return push(annot?.nodeId);
      }
      case "mic": {
        const entries = osc?.entries ?? [];
        if (!entries.length) return missing();
        if (annot) entries.forEach((_, i) => annot.used.add(i));
        const outputs = entries
          .map((e) => e.address.split("/").pop() ?? "")
          .filter((s) => MIC_OUTPUTS.includes(s));
        let address = entries[0]!.address;
        if (outputs.length) address = address.slice(0, address.lastIndexOf("/")) || address;
        c.address = address;
        const prefixOk = entries.every(
          (e) => e.address.startsWith(address + "/") || e.address === address,
        );
        if (!prefixOk)
          issue(
            "warning",
            "mic-prefix",
            `${id}: mic outputs must share one prefix (<address>/level|bands|beat)`,
            node.id,
          );
        if (outputs.length && outputs.join() !== "level") c.outputs = outputs;
        const bands = entries.find((e) => e.address.endsWith("/bands"))?.count;
        if (bands && bands !== 8) c.bands = bands;
        if (osc?.rateHz && osc.rateHz !== 30) c.rateHz = osc.rateHz;
        applyKeys(c, keys, ["target", "lock", "studioOnly", "gain"]);
        return push(annot?.nodeId);
      }
      case "prompt": {
        if (node.component === "Prompt Mix") {
          promptMixes.push({ node, annot });
          if (annot) annot.osc?.entries.forEach((_, i) => annot.used.add(i));
          return;
        }
        const got = need();
        if (!got) return;
        c.address = got.address;
        // `<address>/applied` is the schema's confirmation address, not a second control.
        osc?.entries.forEach((e, i) => {
          if (e.address === `${got.address}/applied`) annot?.used.add(i);
        });
        c.blend = false; // set to true below when the frame has a Prompt Mix
        applyKeys(c, keys, [
          "target",
          "lock",
          "studioOnly",
          "maxLength",
          "maxPresets",
          "confirmMs",
        ]);
        return push(annot?.nodeId);
      }
      case "meter":
      case "label": {
        const got = take(annot, kind, id);
        if (got) c.feedback = got.address;
        else if (kind === "meter") return missing("no feedback address");
        if (kind === "label") c.text = typeof p.Value === "string" ? p.Value : (label ?? "");
        if (kind === "meter" && lower(p.Orientation) === "horizontal") c.orientation = "horizontal";
        return push(annot?.nodeId);
      }
      default: {
        const got = need();
        if (!got) return;
        c.address = got.address;
        applyKeys(c, keys, [
          "target",
          "lock",
          "studioOnly",
          "format",
          "rows",
          "cols",
          "mode",
          "aspect",
        ]);
        return push(annot?.nodeId);
      }
    }
  };

  const visit = (node: FNode, scope: Scope) => {
    if (node.visible === false) return;
    if (node.type === "INSTANCE") {
      const name = node.component;
      if (name === "Unsupported") {
        issue(
          "warning",
          "unsupported",
          `"${node.name}" is an Unsupported placeholder; not exported`,
          node.id,
        );
        return;
      }
      const role = roleOf(name);
      if (!role) {
        issue(
          "warning",
          "unknown-component",
          `unknown component "${name ?? "?"}" (layer "${node.name}") — not in the exporter table; looking inside it`,
          node.id,
        );
      } else if (role.role === "chrome") return;
      else if (role.role === "control") return build(node, role.type, scope);
      const next = scopeFor(node, scope);
      const pattern = name ? PANEL_PATTERNS[name] : undefined;
      if (pattern && !scope.panel) {
        const panelTitle =
          typeof node.props?.Title === "string"
            ? node.props.Title
            : node.children?.find((c) => c.component === "Console Panel")?.props?.Title;
        const title = typeof panelTitle === "string" ? humanize(panelTitle) : undefined;
        const fromLayer = !isDefaultName(node) && slug(node.name);
        next.panel = {
          id: fromLayer || (title && slug(title)) || slug(name!),
          idFrom: fromLayer ? "layer" : title ? "title" : "pattern",
          ...(title ? { title } : {}),
          pattern,
          nodeId: node.id,
          component: name!,
          box: node.box,
          controls: [],
        };
        panels.push(next.panel);
      }
      for (const c of node.children ?? []) visit(c, next);
      return;
    }
    const next = node.annotations?.length || node.plugin ? scopeFor(node, scope) : scope;
    for (const c of node.children ?? []) visit(c, next);
  };

  for (const c of body.children ?? []) visit(c, scopeFor(body, {}));

  // Prompt Mix → blend on the frame's prompt control.
  const prompts = controls.filter((f) => f.control.type === "prompt");
  for (const mix of promptMixes) {
    const target = prompts[0];
    if (!target) {
      issue(
        "warning",
        "prompt-mix-alone",
        `Prompt Mix without Prompt Presets in the same frame; ignored`,
        mix.node.id,
      );
      continue;
    }
    target.control.blend = true;
    // A blending prompt sends <address>/a, /b and /mix (schema); the annotation lists them all,
    // or only the mix address.
    const addr = String(target.control.address);
    const said = (mix.annot?.osc?.entries ?? []).map((e) => e.address);
    const expected = [`${addr}/a`, `${addr}/b`, `${addr}/mix`];
    const ok =
      !said.length || (said.includes(`${addr}/mix`) && said.every((a) => expected.includes(a)));
    if (!ok)
      issue(
        "warning",
        "prompt-mix-address",
        `${target.control.id}: Prompt Mix is annotated ${said.join(", ")}, but a blending prompt sends ${expected.join(", ")} (schema); fix the annotation or the installation`,
        mix.node.id,
      );
  }

  // Unique ids within the frame: repeated layer names (e.g. "Power" in every channel strip) get -1, -2, …
  const byId = new Map<string, FoundControl[]>();
  for (const f of controls) byId.set(f.control.id, [...(byId.get(f.control.id) ?? []), f]);
  for (const [id, list] of byId) {
    if (list.length < 2) continue;
    list.forEach((f, i) => (f.control.id = `${id}-${i + 1}`.slice(0, 64)));
    issue(
      "info",
      "id-suffixed",
      `${list.length} controls named "${id}" → ${list.map((f) => f.control.id).join(", ")}; rename the layers to choose ids`,
    );
  }

  // Annotation bookkeeping: unused addresses, partly used templates, draft markers, Depends on notes.
  for (const a of annots) {
    a.osc?.entries.forEach((e, i) => {
      if (!a.used.has(i))
        issue(
          "warning",
          "unused-address",
          `${e.address} (annotation on "${a.name}") matched no control`,
          a.nodeId,
        );
      const exp = expandRange(e.address);
      const n = a.next.get(i) ?? 0;
      if (exp && n > 0 && n < exp.length)
        issue(
          "warning",
          "template-partly-used",
          `${e.address}: ${exp.length} addresses, ${n} controls`,
          a.nodeId,
        );
    });
    for (const note of a.dependsOn?.notes ?? [])
      issue("info", "depends-on-note", `"${a.name}": ${note}`, a.nodeId);
  }
  const drafts = annots
    .filter((a) => a.osc?.draft)
    .map((a) => ({ nodeId: a.nodeId, name: a.name }));
  // Panels: only those around controls; a list panel has no title by default (Figma List Card).
  const used = new Set(controls.map((f) => f.control.id));
  const kept = panels.filter((p) => p.controls.length);
  for (const p of kept) {
    if (p.pattern === "list") delete p.title;
    let id = p.id;
    for (let n = 2; used.has(id); n++) id = `${p.id}-${n === 2 ? "panel" : `panel-${n - 1}`}`;
    p.id = id;
    used.add(id);
  }
  return { controls, panels: kept, issues, drafts };
}
