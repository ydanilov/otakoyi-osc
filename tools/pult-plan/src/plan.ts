/**
 * Contract → screen plan → draft config (ADR-017). Every split decision goes through the pult's
 * real `layoutPage` (ADR-006) with the token sizes; nothing here re-implements the layout.
 */
import { parseConfig, type AnyControl, type Cell, type FormFactor } from "@osc/schema";
import {
  hasSystemGroup,
  isSystemParameter,
  priorityOf,
  type OscContractDoc,
  type ParameterPriority,
} from "@osc/contract";
import { baseTokens } from "@osc/tokens";
import { itemsFor, layoutPage, MIN_ROW, pultMetrics, type Screen } from "@osc/ui/pult/layout";
import { controlFor, controlId, type DraftControl, type MapIssue, type Shape } from "./controls";

/**
 * Reference pult bodies (pt) from the Figma frames the layout tests use: phone = the Pult frame of
 * an iPhone 16 Pro in portrait (402 × 874 screen, minus status bar, header and home indicator);
 * tablet = the Console frame of an iPad Pro 13" in landscape (1376 × 1032 screen, minus header and
 * the side inspector).
 */
export const REFERENCE: Record<FormFactor, { device: string; width: number; height: number }> = {
  phone: { device: "iPhone 16 Pro, portrait (402 × 874 pt screen)", width: 402, height: 596 },
  tablet: { device: 'iPad Pro 13", landscape (1376 × 1032 pt screen)', width: 1210, height: 603 },
};

export const sizes = baseTokens.control;

/** Grid width and height (columns, rows) per shape and form factor. */
const CELL: Record<FormFactor, Record<Shape, { w: number; h: number }>> = {
  phone: { half: { w: 6, h: 2 }, full: { w: 12, h: 2 }, stretch: { w: 12, h: 6 } },
  tablet: { half: { w: 2, h: 2 }, full: { w: 4, h: 2 }, stretch: { w: 4, h: 6 } },
};

/**
 * Grid cells for controls in reading order, packed in shelves: left to right, and a control that
 * does not fit the row starts a new row below the tallest cell of the current one. Rows are then
 * the bands `layoutPage` splits between (a band is never cut). On a phone each group also starts a
 * new row, so a group reads as a block.
 */
export function placeAll(
  items: ReadonlyArray<{ id: string; shape: Shape; group?: string }>,
  ff: FormFactor,
): Map<string, Cell> {
  const out = new Map<string, Cell>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  let group: string | undefined;
  for (const it of items) {
    const { w, h } = CELL[ff][it.shape];
    const newGroup = ff === "phone" && out.size > 0 && it.group !== group;
    if (x + w > 12 || newGroup) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    group = it.group;
    out.set(it.id, { x, y, w, h });
    x += w;
    rowH = Math.max(rowH, h);
  }
  return out;
}

/** The pult's own screen split for these controls on a reference device. */
export function screensFor(
  controls: ReadonlyArray<{ id: string; shape: Shape; group?: string; control: unknown }>,
  ff: FormFactor,
  ref = REFERENCE[ff],
): Screen[] {
  if (!controls.length) return [];
  const cells = placeAll(controls, ff);
  const items = itemsFor(
    controls.map((c) => c.control as AnyControl),
    [],
    sizes,
  );
  return layoutPage(cells, items, ref.width, ref.height, pultMetrics(ff, sizes));
}

export interface PlannedPage {
  id: string;
  title: string;
  /** `live` when the tab holds any live parameter, otherwise the priority of its parameters. */
  priority: ParameterPriority;
  groups: string[];
  /** Live parameters first, then tune, each in `order` (the first screen runs the show). */
  controls: DraftControl[];
  /** Screens of this tab on the plan's form factor; swiped horizontally inside the tab. */
  screens: number;
}

export interface Plan {
  form: FormFactor;
  /** Main pult tabs: one per TouchDesigner parameter page (contract group), in TD order. */
  main: PlannedPage[];
  setup: PlannedPage[];
  /** Parameters for the other form factor only (`formFactors`), on a last page. */
  otherOnly: DraftControl[];
  issues: MapIssue[];
}

type Unit = { id: string; shape: Shape; group: string; control: Record<string, unknown> };
const units = (cs: DraftControl[]): Unit[] =>
  cs.map((c) => ({
    id: c.control.id as string,
    shape: c.shape,
    group: c.group,
    control: c.control,
  }));
/** One screen, and nothing scaled below its Figma height (a band taller than a screen is scaled). */
export function fitsOneScreen(
  controls: ReadonlyArray<{ id: string; shape: Shape; group?: string; control: unknown }>,
  ff: FormFactor,
): boolean {
  const screens = screensFor(controls, ff);
  if (screens.length > 1) return false;
  if (!screens.length) return true;
  const cells = placeAll(controls, ff);
  const items = itemsFor(
    controls.map((c) => c.control as AnyControl),
    [],
    sizes,
  );
  const gap = pultMetrics(ff, sizes).gap;
  for (const [id, r] of screens[0]!.rects) {
    const it = items.get(id);
    const rows = cells.get(id)!.h;
    const need = it?.height ?? Math.max(it?.min ?? 0, rows * MIN_ROW + (rows - 1) * gap);
    if (r.h < need - 0.5) return false;
  }
  return true;
}
const fits = (cs: DraftControl[], ff: FormFactor) => fitsOneScreen(units(cs), ff);

const slug = (s: string) => controlId(`/${s}`) || "page";

const RANK: Record<ParameterPriority, number> = { live: 0, tune: 1, setup: 2, hidden: 3 };

/**
 * One tab per TouchDesigner parameter page (contract group), in TD order. The planner never merges
 * or reorders pages: logical grouping is decided in TouchDesigner (otakoyi-td-template
 * standards §4). Inside a tab live parameters come first, then tune, each by `order`; a tab bigger
 * than one screen gets more screens, swiped horizontally, where `layoutPage` splits it.
 */
function tabsFor(groups: Array<[string, DraftControl[]]>, ff: FormFactor): PlannedPage[] {
  return groups.map(([g, cs]) => {
    const controls = [...cs].sort((a, b) => RANK[a.priority] - RANK[b.priority]);
    return {
      id: "",
      title: g,
      priority: controls[0]!.priority,
      groups: [g],
      controls,
      screens: Math.max(1, screensFor(units(controls), ff).length),
    };
  });
}

const PRIORITY_TITLE: Record<ParameterPriority, string> = {
  live: "Live",
  tune: "Tune",
  setup: "Setup",
  hidden: "Hidden",
};

/** The screen plan for one form factor (`pnpm pult-plan`). */
export function planContract(contract: OscContractDoc, form: FormFactor): Plan {
  const issues: MapIssue[] = [];
  const ids = new Set<string>();
  const drafts: DraftControl[] = [];
  const otherOnly: DraftControl[] = [];
  contract.parameters.forEach((p) => {
    // The System group is the standard System screen in the Installation panel (ADR-018).
    if (priorityOf(p) === "hidden" || isSystemParameter(p)) return;
    let id = controlId(p.address);
    for (let n = 2; ids.has(id); n++) id = `${controlId(p.address).slice(0, 60)}-${n}`;
    ids.add(id);
    const d = controlFor(p, id, issues);
    if (p.formFactors && !p.formFactors.includes(form)) otherOnly.push(d);
    else drafts.push(d);
  });
  if (hasSystemGroup(contract))
    issues.push({
      level: "info",
      code: "system-screen",
      message:
        "the System group (Resw, Resh, Debug, Seed) is the standard System screen in the Installation panel, not a project screen",
    });
  const untagged = contract.parameters.filter((p) => !p.priority && !isSystemParameter(p)).length;
  if (untagged && contract.contractVersion !== 1)
    issues.push({
      level: "warning",
      code: "untagged",
      message: `${untagged} parameter(s) without priority, drafted as tune`,
    });

  const grouped = (prios: ParameterPriority[]): Array<[string, DraftControl[]]> => {
    const order: string[] = [];
    const by = new Map<string, DraftControl[]>();
    for (const d of drafts.filter((x) => prios.includes(x.priority))) {
      if (!by.has(d.group)) {
        by.set(d.group, []);
        order.push(d.group);
      }
      by.get(d.group)!.push(d);
    }
    // `order` sorts inside a group; ties (and no order) keep the contract's order (stable sort).
    for (const cs of by.values())
      cs.sort((a, b) => (a.param.order ?? Infinity) - (b.param.order ?? Infinity));
    return order.map((g) => [g, by.get(g)!]);
  };

  const name = (pages: PlannedPage[]) => {
    const used = new Set<string>();
    for (const p of pages) {
      let id = slug(p.title);
      for (let n = 2; used.has(id); n++) id = `${slug(p.title)}-${n}`;
      used.add(id);
      p.id = id;
    }
    return pages;
  };
  const main = name(tabsFor(grouped(["live", "tune"]), form));
  const setup = name(tabsFor(grouped(["setup"]), form));

  // The first screen runs the show: one TD page holds every live parameter, comes first, and its
  // live part fits one screen. Grouping is fixed in TouchDesigner, so the fixes name TD pages.
  const liveTabs = main.filter((p) => p.priority === "live");
  if (liveTabs.length > 1)
    issues.push({
      level: "warning",
      code: "live-scattered",
      message: `live parameters are on ${liveTabs.length} TD pages (${liveTabs.map((p) => p.title).join(", ")}); put the show on one page in TouchDesigner`,
    });
  if (liveTabs.length && main[0]!.priority !== "live")
    issues.push({
      level: "warning",
      code: "live-not-first",
      message: `the first tab "${main[0]!.title}" has no live parameters; make "${liveTabs[0]!.title}" the first page in TouchDesigner`,
    });
  for (const t of liveTabs) {
    const live = t.controls.filter((c) => c.priority === "live");
    if (!fits(live, form))
      issues.push({
        level: "warning",
        code: "live-overflow",
        message: `live parameters on "${t.title}" need more than one ${form} screen; the first screen should hold the whole show (move some to [tune])`,
      });
  }
  if (main.length > 1)
    for (const t of main.filter((p) => p.controls.length <= 2))
      issues.push({
        level: "info",
        code: "small-tab",
        message: `tab "${t.title}" has ${t.controls.length} control(s); if it belongs with another page, merge the pages in TouchDesigner`,
      });
  if (otherOnly.length)
    issues.push({
      level: "info",
      code: "form-factor-only",
      message: `${otherOnly.length} parameter(s) only for ${form === "phone" ? "tablet" : "phone"}: ${otherOnly.map((d) => d.param.address).join(", ")}`,
    });
  return { form, main, setup, otherOnly, issues };
}

/** Primary form factor (ADR-013): live → tablet, lobby / both → phone. */
export function primaryForm(contract: OscContractDoc): FormFactor {
  return contract.installation.useCase === "live" ? "tablet" : "phone";
}

export interface DraftResult {
  config: Record<string, unknown>;
  plan: Plan;
  /** Screens per tab on each form factor; a tab bigger than a screen swipes to more. */
  screens: Array<{ pult: string; page: string; phone: number; tablet: number }>;
  issues: MapIssue[];
}

/**
 * The draft config (`pnpm pult-draft`): pult `main` (one tab per TD parameter page, live first
 * inside each, then a tab for the other form factor's parameters) and, for `[setup]` parameters, a
 * Setup pult shown in the Installation panel (`placement: "installation"`), one panel per TD page. Both form factors get a layout of the same tabs; the pult
 * splits a tab into horizontally swiped screens where it does not fit.
 */
export function draftConfig(contract: OscContractDoc, form = primaryForm(contract)): DraftResult {
  const plan = planContract(contract, form);
  const issues = [...plan.issues];
  const screens: DraftResult["screens"] = [];
  const other: FormFactor = form === "phone" ? "tablet" : "phone";

  const page = (pultId: string, id: string, title: string, cs: DraftControl[]) => {
    const us = units(cs);
    const layout = {
      phone: Object.fromEntries(placeAll(us, "phone")),
      tablet: Object.fromEntries(placeAll(us, "tablet")),
    };
    screens.push({
      pult: pultId,
      page: id,
      phone: screensFor(us, "phone").length,
      tablet: screensFor(us, "tablet").length,
    });
    return { id, title, controls: cs.map((c) => c.control), layout };
  };

  const mainPages = plan.main.map((p) => page("main", p.id, p.title, p.controls));
  if (plan.otherOnly.length)
    mainPages.push(
      page(
        "main",
        `${other}-only`,
        `${other === "tablet" ? "Tablet" : "Phone"} only`,
        plan.otherOnly,
      ),
    );
  const pults: Record<string, unknown>[] = [];
  if (mainPages.length)
    pults.push({
      id: "main",
      name: contract.installation.name,
      formFactor: form,
      pages: mainPages,
    });
  // [setup] parameters live in the Installation panel (Installation › Setup), not on the pult.
  if (plan.setup.length)
    pults.push({
      id: "setup",
      name: "Setup",
      placement: "installation",
      pages: plan.setup.map((p) => page("setup", p.id, p.title, p.controls)),
    });
  if (!mainPages.length && plan.setup.length)
    issues.push({
      level: "warning",
      code: "setup-only",
      message:
        "only [setup] parameters: the pult screen would be empty; tag the show parameters [live] or [tune]",
    });
  if (!pults.length) {
    issues.push({
      level: "warning",
      code: "empty",
      message: "no visible parameters; nothing to draft",
    });
  }

  const config: Record<string, unknown> = {
    schemaVersion: 2,
    installation: {
      id: contract.installation.id,
      name: contract.installation.name,
      revision: 1,
      ...(contract.actions ? { actions: contract.actions } : {}),
    },
    targets: [
      {
        id: "main",
        name: contract.software?.app ?? "installation",
        protocol: contract.osc.in.protocol ?? "udp",
        host: "127.0.0.1",
        port: contract.osc.in.port,
        ...(contract.osc.feedback ? { feedbackPort: contract.osc.feedback.port } : {}),
      },
    ],
    theme: { mode: "dark" },
    pults,
    // Standard System screen (ADR-018) on the default /system/* addresses.
    ...(hasSystemGroup(contract) ? { system: {} } : {}),
  };
  return { config, plan, screens, issues };
}

/** Validates a draft with the app's own config parser; errors are `path: message`. */
export function validateDraft(config: unknown): string[] {
  const r = parseConfig(config);
  if (r.ok) return [];
  if (r.reason === "newer-schema")
    return [`schemaVersion ${r.schemaVersion} is newer than the app`];
  return r.issues.map((i) => `${i.path || "(root)"}: ${i.message}`);
}

export { PRIORITY_TITLE };
