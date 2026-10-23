/**
 * Snapshot of a client page → installation config + report (ADR-014).
 *
 * Frames: `<pult-id> / <phone|tablet> / <page-id>` (the convention), or a prototype screen named
 * `Phone / …` / `Tablet / …` that contains a `Pult Header` with `Mode=Control`. The active
 * `Screen Tab` of a frame names its page; frames left to right give the order; a second frame for
 * the same page and form factor (a state variant such as view-only or connection-lost) is skipped.
 * Controls of a page are merged across phone and tablet by id.
 */
import { FORM_FACTORS, parseConfig, reflowForPhone, type FormFactor, type Grid } from "@osc/schema";
import { brandFromFigma } from "@osc/tokens";
import { bottomOf, gridFor } from "./grid";
import {
  mapFrame,
  slug,
  type FoundControl,
  type FoundPanel,
  type Issue,
  type Level,
  type RawControl,
} from "./mapping";
import { findFirst, walk, type FNode, type Snapshot } from "./snapshot";

/** What Figma does not hold: installation, targets, theme (brand), presets. */
export interface BaseConfig {
  installation?: { id?: string; name?: string; revision?: number; actions?: string[] };
  targets?: Record<string, unknown>[];
  theme?: Record<string, unknown>;
  presets?: Record<string, unknown>[];
  pult?: {
    id?: string;
    name?: string;
    defaultTarget?: string;
    /** Primary form factor (ADR-013); otherwise the form factor drawn first on the page. */
    formFactor?: FormFactor;
    /** Icon in the Installation › Pults list (Phosphor kebab name). */
    icon?: string;
  };
}

/** The installation's OSC contract (`otakoyi/osc-contract.json`, docs/osc-contract.schema.json). */
export interface OscContract {
  parameters: { address: string; type?: string }[];
}

export interface ExportOptions {
  base?: BaseConfig;
  /** Only frames inside sections whose name contains this text (case-insensitive) or with this id. */
  section?: string;
  contract?: OscContract;
  /** The published config: `revision` is bumped when the pults differ. */
  previous?: { installation?: { revision?: number }; pults?: unknown };
  /**
   * Figma Brand mode for the config's `theme` colours (e.g. "Aurora · Template"). Default: the
   * mode set on the pult frames' section (or frame, or page).
   */
  brand?: string;
}

export interface PageSummary {
  id: string;
  title: string;
  frames: Partial<Record<FormFactor, { id: string; name: string }>>;
  controls: number;
}

export interface ExportResult {
  config: Record<string, unknown>;
  valid: boolean;
  issues: Issue[];
  summary: {
    page: string;
    fileKey?: string;
    pultId: string;
    pages: PageSummary[];
    controls: number;
    screensSkipped: number;
  };
}

const DEFAULT_TARGET = {
  id: "td",
  name: "TouchDesigner",
  protocol: "udp",
  host: "auto",
  port: 7000,
  feedbackPort: 9000,
};
const LEVELS: Level[] = ["error", "warning", "info"];

interface PultFrame {
  frame: FNode;
  /** Brand mode set on the frame or its section. */
  brandMode?: string;
  ff: FormFactor;
  pultId?: string;
  pageId: string;
  title: string;
  tabs: string[];
  body: FNode;
}

function tabsOf(frame: FNode): { labels: string[]; active?: string } {
  const bar = findFirst(frame, (n) => n.component === "Tab Bar");
  const labels: string[] = [];
  let active: string | undefined;
  if (bar)
    walk(bar, (n) => {
      if (n.component !== "Screen Tab") return;
      const l =
        typeof n.props?.Label === "string"
          ? n.props.Label
          : findFirst(n, (t) => t.type === "TEXT")?.text;
      if (l) {
        labels.push(l);
        if (n.props?.State === "Active") active = l;
      }
      return false;
    });
  return { labels, active };
}

/** The part of a pult frame that holds the controls (`Pult` / `Console` frame, else the frame). */
export function bodyOf(frame: FNode): FNode {
  return (
    frame.children?.find(
      (c) => c.type !== "INSTANCE" && /^(pult|console|body|controls)$/i.test(c.name),
    ) ?? frame
  );
}

/** Classify a top-level frame; `skip` explains why a pult-looking frame is not used. */
function classify(frame: FNode): { pf?: PultFrame; skip?: string } {
  const parts = frame.name.split("/").map((s) => s.trim());
  const ffOf = (s?: string) =>
    s && /^(phone|tablet)$/i.test(s) ? (s.toLowerCase() as FormFactor) : undefined;
  const header = findFirst(frame, (n) => n.component === "Pult Header");
  const tabs = tabsOf(frame);
  if (parts.length >= 3 && ffOf(parts[1])) {
    const pageId = slug(parts[2]!);
    return {
      pf: {
        frame,
        ff: ffOf(parts[1])!,
        pultId: slug(parts[0]!),
        pageId,
        title: tabs.active ?? parts[2]!,
        tabs: tabs.labels,
        body: bodyOf(frame),
      },
    };
  }
  const ff = ffOf(parts[0]);
  if (!ff || !header) return {};
  const mode = header.props?.Mode;
  if (mode && mode !== "Control") return { skip: `Pult Header Mode=${String(mode)}` };
  const title = tabs.active ?? parts.slice(1).join(" / ");
  return { pf: { frame, ff, pageId: slug(title), title, tabs: tabs.labels, body: bodyOf(frame) } };
}

function topFrames(snap: Snapshot, section?: string): Array<{ frame: FNode; section?: FNode }> {
  const out: Array<{ frame: FNode; section?: FNode }> = [];
  const want = section?.toLowerCase();
  for (const n of snap.nodes) {
    if (n.type === "SECTION") {
      if (want && !n.name.toLowerCase().includes(want) && n.id !== section) continue;
      for (const c of n.children ?? [])
        if (c.type === "FRAME" || c.type === "COMPONENT") out.push({ frame: c, section: n });
    } else if (n.type === "FRAME" && !want) out.push({ frame: n });
  }
  return out;
}

function addressesOf(c: RawControl): string[] {
  const out: string[] = [];
  // A colour picker in the default `hsb` format sends on <address>/h, /s and /b.
  if (c.type === "colorPicker" && typeof c.address === "string" && (c.format ?? "hsb") === "hsb")
    out.push(...["h", "s", "b"].map((ch) => `${String(c.address)}/${ch}`));
  else if (typeof c.address === "string") out.push(c.address);
  if (Array.isArray(c.buttons))
    for (const b of c.buttons as { address?: unknown }[])
      if (typeof b.address === "string") out.push(b.address);
  return out;
}

function contractHas(contract: OscContract, address: string): boolean {
  // `<base>/h|s|b` of a colour picker: the contract may list the channels or one `color` parameter.
  const channel = /^(.+)\/[hsb]$/.exec(address);
  return contract.parameters.some((p) => {
    if (p.address === address) return true;
    if (channel && p.address === channel[1] && p.type === "color") return true;
    if (!/\{[a-z]+\}/i.test(p.address)) return false;
    const re = new RegExp(
      "^" +
        p.address
          .split(/\{[a-z]+\}/i)
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("[^/]+") +
        "$",
    );
    return re.test(address);
  });
}

/** Stable key order for the JSON output. */
function ordered(c: RawControl): RawControl {
  const first = ["id", "type", "label", "address", "feedback"];
  const out: Record<string, unknown> = {};
  for (const k of first) if (c[k] !== undefined) out[k] = c[k];
  for (const k of Object.keys(c).sort()) if (!(k in out) && c[k] !== undefined) out[k] = c[k];
  return out as RawControl;
}

export function exportSnapshot(snap: Snapshot, opts: ExportOptions = {}): ExportResult {
  const issues: Issue[] = [];
  const issue = (level: Level, code: string, message: string, nodeId?: string, where?: string) =>
    issues.push({ level, code, message, nodeId, where });
  const base = opts.base ?? {};

  const pageName = snap.page.name;
  const installId = base.installation?.id ?? slug(pageName.replace(/^client\s*[·/|:-]\s*/i, ""));
  const installName = base.installation?.name ?? pageName.replace(/^client\s*[·/|:-]\s*/i, "");

  // 1. Pult frames, left to right per section.
  const frames = topFrames(snap, opts.section);
  const pultFrames: PultFrame[] = [];
  let skipped = 0;
  const seen = new Map<string, PultFrame>();
  for (const { frame: f, section } of frames) {
    const { pf, skip } = classify(f);
    if (!pf) {
      skipped++;
      if (skip) issue("info", "frame-skipped", `"${f.name}" skipped (${skip})`, f.id);
      continue;
    }
    const key = `${pf.pultId ?? ""}|${pf.ff}|${pf.pageId}`;
    const first = seen.get(key);
    if (first) {
      skipped++;
      issue(
        "info",
        "state-variant",
        `"${f.name}" shows the same page as "${first.frame.name}"; skipped as a state variant`,
        f.id,
      );
      continue;
    }
    seen.set(key, pf);
    const brandMode = f.brandMode ?? section?.brandMode;
    if (brandMode) pf.brandMode = brandMode;
    pultFrames.push(pf);
  }
  if (!pultFrames.length)
    issue(
      "error",
      "no-pult-frames",
      `no pult frames found on "${pageName}"${opts.section ? ` (section "${opts.section}")` : ""}`,
    );

  const pultIds = [...new Set(pultFrames.map((p) => p.pultId).filter(Boolean))] as string[];
  if (pultIds.length > 1)
    issue(
      "warning",
      "several-pults",
      `frames name several pults (${pultIds.join(", ")}); this exporter writes one pult per page — only "${pultIds[0]}" is exported`,
    );
  const pultId = base.pult?.id ?? pultIds[0] ?? installId;
  const frameList = pultFrames.filter((p) => !p.pultId || p.pultId === pultId);

  // 2. Tabs: pages in tab order; tabs without a frame; tab bars that disagree.
  const tabOrder: string[] = [];
  const titles = new Map<string, string>();
  for (const p of frameList) {
    for (const t of p.tabs.length ? p.tabs : [p.title]) {
      const id = slug(t);
      if (!tabOrder.includes(id)) tabOrder.push(id);
      if (!titles.has(id)) titles.set(id, t);
    }
  }
  for (const ff of FORM_FACTORS) {
    const fs = frameList.filter((p) => p.ff === ff);
    const bars = [...new Set(fs.map((p) => p.tabs.join(" | ")).filter(Boolean))];
    if (bars.length > 1)
      issue(
        "warning",
        "tabs-disagree",
        `${ff} tab bars differ between frames: ${bars.map((b) => `[${b}]`).join(" vs ")}`,
      );
    const tabs = [...new Set(fs.flatMap((p) => p.tabs))];
    const missing = tabs.filter((t) => !fs.some((p) => p.pageId === slug(t)));
    if (missing.length)
      issue(
        "warning",
        "tab-without-frame",
        `${ff} tabs without a pult frame (not exported): ${missing.join(", ")}`,
      );
  }

  // 3. Map every frame.
  interface PageAcc {
    id: string;
    title: string;
    frames: Partial<Record<FormFactor, PultFrame>>;
    found: Partial<Record<FormFactor, FoundControl[]>>;
    panels: Partial<Record<FormFactor, FoundPanel[]>>;
  }
  const pages = new Map<string, PageAcc>();
  const drafts = new Map<string, string>();
  const derivedIds: string[] = [];
  for (const p of frameList) {
    const where = `${p.ff}/${p.pageId}`;
    const r = mapFrame(p.body, { where, deferMissing: true });
    issues.push(...r.issues);
    for (const d of r.drafts) drafts.set(d.nodeId, d.name);
    for (const f of r.controls)
      if (f.idFrom !== "layer") derivedIds.push(`${f.control.id} (${f.component})`);
    const acc = pages.get(p.pageId) ?? {
      id: p.pageId,
      title: p.title,
      frames: {},
      found: {},
      panels: {},
    };
    acc.frames[p.ff] = p;
    acc.found[p.ff] = r.controls;
    acc.panels[p.ff] = r.panels;
    pages.set(p.pageId, acc);
  }
  if (drafts.size)
    issue(
      "warning",
      "draft-annotation",
      `${drafts.size} OSC annotations are marked draft — confirm them against the installation's otakoyi/osc-contract.json: ${[...new Set(drafts.values())].join(", ")}`,
    );
  if (derivedIds.length)
    issue(
      "info",
      "default-layer-names",
      `${derivedIds.length} control layers keep the component name, so ids were derived from labels / panel titles: ${[...new Set(derivedIds)].join(", ")} — rename the layers to fix the ids`,
    );

  // 4. Merge phone + tablet per page; unique ids across the pult.
  const usedIds = new Map<string, string>(); // id → page
  const outPages: Record<string, unknown>[] = [];
  const summaries: PageSummary[] = [];
  const allControls: { page: string; c: RawControl }[] = [];
  const sorted = [...pages.values()].sort(
    (a, b) => tabOrder.indexOf(a.id) - tabOrder.indexOf(b.id),
  );
  for (const page of sorted) {
    const controls: RawControl[] = [];
    const byId = new Map<string, RawControl>();
    /** Found control (either form factor) → its id in the config. */
    const outId = new Map<FoundControl, string>();
    const missing = new Map<RawControl, Issue>();
    const boxes: Record<FormFactor, { id: string; box?: [number, number, number, number] }[]> = {
      phone: [],
      tablet: [],
    };
    for (const ff of FORM_FACTORS) {
      for (const f of page.found[ff] ?? []) {
        const orig = f.control.id;
        let c = f.control;
        const prev = byId.get(orig);
        if (prev && prev.type === c.type && !boxes[ff].some((b) => b.id === prev.id)) {
          if (
            prev.address !== undefined &&
            c.address !== undefined &&
            JSON.stringify(prev.address) !== JSON.stringify(c.address)
          )
            issue(
              "warning",
              "form-factor-conflict",
              `${prev.id}: phone and tablet annotate different addresses (${String(prev.address)} vs ${String(c.address)}); kept ${String(prev.address)}`,
              f.nodeId,
              `${ff}/${page.id}`,
            );
          for (const [k, v] of Object.entries(c))
            if (k !== "id" && prev[k] === undefined) prev[k] = v;
          if (!f.missing) missing.delete(prev);
          boxes[ff].push({ id: prev.id, box: f.box });
          outId.set(f, prev.id);
          continue;
        }
        if (prev) {
          c = { ...c, id: `${orig}-${ff}` };
          issue(
            "warning",
            "id-clash",
            `${orig}: another control on this page already uses the id; renamed to ${c.id}`,
            f.nodeId,
            `${ff}/${page.id}`,
          );
        }
        const other = usedIds.get(c.id);
        if (other && other !== page.id) {
          const renamed = `${page.id}-${c.id}`.slice(0, 64);
          issue(
            "info",
            "id-renamed",
            `${c.id} is already used on page "${other}"; renamed to ${renamed} (control ids are unique per pult)`,
            f.nodeId,
            `${ff}/${page.id}`,
          );
          c = { ...c, id: renamed };
        }
        usedIds.set(c.id, page.id);
        if (!prev) byId.set(orig, c);
        if (f.missing) missing.set(c, f.missing);
        controls.push(c);
        boxes[ff].push({ id: c.id, box: f.box });
        outId.set(f, c.id);
      }
    }

    // Still no address after merging phone and tablet: report and leave the control out.
    for (const [c, i] of missing) {
      issues.push(i);
      controls.splice(controls.indexOf(c), 1);
      for (const ff of FORM_FACTORS) boxes[ff] = boxes[ff].filter((b) => b.id !== c.id);
    }
    // Panels (Console-Panel patterns): merged by id across phone and tablet. In a form factor
    // that draws the panel, the panel is placed instead of the controls in it.
    const kept = new Set(controls.map((c) => c.id));
    const panels: Array<{ id: string; title?: string; pattern: string; controls: string[] }> = [];
    const panelIn: Record<FormFactor, Map<string, [number, number, number, number] | undefined>> = {
      phone: new Map(),
      tablet: new Map(),
    };
    for (const ff of FORM_FACTORS)
      for (const fp of page.panels[ff] ?? []) {
        const ids = fp.controls
          .map((f) => outId.get(f))
          .filter((id): id is string => !!id && kept.has(id));
        if (!ids.length) continue;
        let p = panels.find((x) => x.id === fp.id);
        if (!p) {
          let id = fp.id;
          for (let n = 2; kept.has(id); n++) id = `${fp.id}-panel${n > 2 ? `-${n - 1}` : ""}`;
          p = { id, ...(fp.title ? { title: fp.title } : {}), pattern: fp.pattern, controls: [] };
          panels.push(p);
        } else if (p.pattern !== fp.pattern)
          issue(
            "warning",
            "panel-pattern-differs",
            `panel "${p.id}" is a ${p.pattern} on one form factor and a ${fp.pattern} on the other; kept ${p.pattern}`,
            fp.nodeId,
            `${ff}/${page.id}`,
          );
        for (const id of ids)
          if (!p.controls.includes(id)) {
            const other = panels.find((x) => x !== p && x.controls.includes(id));
            if (other) continue;
            p.controls.push(id);
          }
        panelIn[ff].set(p.id, fp.box);
      }
    const layout: Record<FormFactor, Record<string, Grid>> = { phone: {}, tablet: {} };
    const grids: Partial<Record<FormFactor, Map<string, Grid>>> = {};
    for (const ff of FORM_FACTORS) {
      if (!page.frames[ff]) continue;
      const inPanel = new Set(
        panels.filter((p) => panelIn[ff].has(p.id)).flatMap((p) => p.controls),
      );
      grids[ff] = gridFor([
        ...boxes[ff].filter((b) => !inPanel.has(b.id)),
        ...[...panelIn[ff]].map(([id, box]) => ({ id, box })),
      ]);
    }
    if (!grids.phone && grids.tablet) {
      grids.phone = reflowForPhone(grids.tablet);
      issue(
        "warning",
        "missing-form-factor",
        `page "${page.title}" has no phone frame; phone layout reflowed from the tablet frame`,
        undefined,
        `phone/${page.id}`,
      );
    }
    if (!grids.tablet && grids.phone) {
      grids.tablet = new Map(grids.phone);
      issue(
        "warning",
        "missing-form-factor",
        `page "${page.title}" has no tablet frame; tablet layout copied from the phone frame`,
        undefined,
        `tablet/${page.id}`,
      );
    }
    for (const ff of FORM_FACTORS) {
      const g = grids[ff] ?? new Map<string, Grid>();
      let row = bottomOf(g.values());
      const only: string[] = [];
      // A panel placed in this form factor's grid covers its controls; a panel the reflow /
      // copy carried over from the other form factor too.
      const placedPanels = panels.filter((p) => g.has(p.id));
      for (const p of placedPanels) layout[ff][p.id] = g.get(p.id)!;
      const covered = new Set(placedPanels.flatMap((p) => p.controls));
      for (const c of controls) {
        if (covered.has(c.id)) continue;
        const cell = g.get(c.id);
        if (cell) layout[ff][c.id] = cell;
        else {
          layout[ff][c.id] = { x: 0, y: row++, w: 12, h: 1 };
          only.push(c.id);
        }
      }
      if (only.length && page.frames[ff])
        issue(
          "warning",
          "not-on-form-factor",
          `${only.join(", ")} not in the ${ff} frame of "${page.title}"; appended full-width at the bottom of the ${ff} layout`,
          page.frames[ff]?.frame.id,
          `${ff}/${page.id}`,
        );
    }

    const out = controls.map(ordered);
    outPages.push({
      id: page.id,
      title: titles.get(page.id) ?? page.title,
      controls: out,
      ...(panels.length ? { panels } : {}),
      layout,
    });
    for (const c of out) allControls.push({ page: page.id, c });
    summaries.push({
      id: page.id,
      title: titles.get(page.id) ?? page.title,
      frames: Object.fromEntries(
        FORM_FACTORS.filter((ff) => page.frames[ff]).map((ff) => [
          ff,
          { id: page.frames[ff]!.frame.id, name: page.frames[ff]!.frame.name },
        ]),
      ),
      controls: out.length,
    });
  }

  // 5. Cross-checks: duplicate addresses, enabledWhen references, OSC contract.
  const byAddress = new Map<string, string[]>();
  for (const { c } of allControls)
    for (const a of addressesOf(c)) byAddress.set(a, [...(byAddress.get(a) ?? []), c.id]);
  for (const [a, ids] of byAddress)
    if (ids.length > 1)
      issue(
        "warning",
        "duplicate-address",
        `${a} is sent by ${ids.length} controls: ${ids.join(", ")}`,
      );
  const ids = new Set(allControls.map(({ c }) => c.id));
  for (const { c } of allControls)
    for (const w of (c.enabledWhen as { control: string }[] | undefined) ?? [])
      if (!ids.has(w.control))
        issue(
          "warning",
          "depends-on-unknown",
          `${c.id}: "Depends on" refers to unknown control "${w.control}"`,
        );
  if (opts.contract)
    for (const [a, cids] of byAddress)
      if (!contractHas(opts.contract, a))
        issue(
          "error",
          "not-in-contract",
          `${a} (${cids.join(", ")}) is not in the installation's OSC contract`,
        );

  // 6. Assemble, bump revision, validate.
  // Primary form factor (ADR-013): the base config's, else the form factor drawn first.
  const formFactor = base.pult?.formFactor ?? frameList[0]?.ff;
  if (formFactor && !base.pult?.formFactor)
    issue(
      "info",
      "form-factor",
      `primary form factor: ${formFactor} (drawn first on the page; set pult.formFactor in --base to choose)`,
    );
  const pult: Record<string, unknown> = {
    id: pultId,
    name: base.pult?.name ?? installName,
    ...(base.pult?.defaultTarget ? { defaultTarget: base.pult.defaultTarget } : {}),
    ...(formFactor ? { formFactor } : {}),
    ...(base.pult?.icon ? { icon: base.pult.icon } : {}),
    pages: outPages,
  };

  // Theme colours from the client's Figma Brand mode (base supplies mode, logo, splash, font).
  let theme = base.theme;
  const modeName =
    opts.brand ?? frameList.find((p) => p.brandMode)?.brandMode ?? snap.page.brandMode;
  if (modeName) {
    const mode = snap.brand?.modes[modeName];
    if (!snap.brand)
      issue(
        "error",
        "no-brand-modes",
        `Brand mode "${modeName}" asked for, but the snapshot has no Brand variables — export it with the Otakoyi Inspector`,
      );
    else if (!mode)
      issue(
        "error",
        "unknown-brand-mode",
        `Brand mode "${modeName}" is not in Figma (modes: ${Object.keys(snap.brand.modes).join(", ")})`,
      );
    else {
      const b = brandFromFigma(mode);
      for (const u of b.unknown)
        issue("warning", "brand-variable", `Brand variable ${u} has no config theme key; ignored`);
      for (const d of b.dropped) issue("warning", "brand-signal-light", d);
      theme = { ...base.theme, ...b.theme };
      issue(
        "info",
        "brand-mode",
        `theme colours from the Figma Brand mode "${modeName}"${opts.brand ? "" : " (set on the client page)"}`,
      );
    }
  }
  if (!base.targets?.length)
    issue(
      "info",
      "default-target",
      `no --base config: targets set to the default (udp 7000, feedback 9000)${theme ? "" : "; theme left to the app default"}`,
    );
  let revision = base.installation?.revision ?? opts.previous?.installation?.revision ?? 1;
  if (
    opts.previous?.installation?.revision !== undefined &&
    JSON.stringify(opts.previous.pults) !== JSON.stringify([pult])
  )
    revision = opts.previous.installation.revision + 1;
  const config: Record<string, unknown> = {
    schemaVersion: 2,
    installation: {
      id: installId,
      name: installName,
      revision,
      ...(base.installation?.actions ? { actions: base.installation.actions } : {}),
    },
    targets: base.targets?.length ? base.targets : [DEFAULT_TARGET],
    ...(theme ? { theme } : {}),
    ...(base.presets?.length ? { presets: base.presets } : {}),
    pults: [pult],
  };
  const parsed = parseConfig(config);
  if (!parsed.ok) {
    if (parsed.reason === "invalid")
      for (const i of parsed.issues) issue("error", "schema", `${i.path}: ${i.message}`);
    else
      issue(
        "error",
        "schema",
        `schema version ${parsed.schemaVersion} is newer than this exporter`,
      );
  }

  const rank = (l: Level) => LEVELS.indexOf(l);
  const sortedIssues = issues
    .map((i, n) => ({ i, n }))
    .sort((a, b) => rank(a.i.level) - rank(b.i.level) || a.n - b.n)
    .map((x) => x.i);
  return {
    config,
    valid: parsed.ok,
    issues: sortedIssues,
    summary: {
      page: pageName,
      fileKey: snap.fileKey,
      pultId,
      pages: summaries,
      controls: allControls.length,
      screensSkipped: skipped,
    },
  };
}
