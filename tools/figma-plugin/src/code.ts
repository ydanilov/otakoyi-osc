/**
 * Otakoyi Inspector — Figma dev plugin (ADR-014).
 *
 * - Shows what tools/figma-export makes of the selection: control type, id, OSC address, the
 *   control JSON (checked with the schema) and the exporter's warnings for it.
 * - Edits the selection's "OSC" and "Depends on" Dev Mode annotations, and mirrors them into shared
 *   plugin data (namespace `otakoyi`) so the exporter's REST mode can read them.
 * - Exports the current page as an exporter snapshot (offline input for the CLI).
 */
import {
  SNAPSHOT_FORMAT,
  annotationTexts,
  bodyOf,
  mapFrame,
  walk,
  type FNode,
  type Snapshot,
} from "@osc/figma-export";
import { Control } from "@osc/schema";
import {
  NAMESPACE,
  brandContext,
  brandModeOf,
  categoryLabels,
  pultFrameOf,
  serialize,
} from "./serialize";

type FromUi =
  | { type: "refresh" }
  | { type: "check"; osc: string; dependsOn: string }
  | { type: "save"; osc: string; dependsOn: string }
  | { type: "snapshot" };

const CATEGORIES = {
  osc: { label: "OSC", color: "green" },
  dependsOn: { label: "Depends on", color: "orange" },
} as const;

figma.showUI(__html__, { width: 380, height: 620, themeColors: true });

function post(msg: unknown) {
  figma.ui.postMessage(msg);
}

function findNode(root: FNode, id: string): { node: FNode; path: FNode[] } | undefined {
  let out: { node: FNode; path: FNode[] } | undefined;
  walk(root, (n, parents) => {
    if (out) return false;
    if (n.id === id) out = { node: n, path: parents };
  });
  return out;
}

async function analyze(overrides?: { osc: string; dependsOn: string }) {
  const sel = figma.currentPage.selection[0];
  if (!sel) return post({ type: "analysis", data: null });
  const cats = await categoryLabels();
  const frame = pultFrameOf(sel);
  const tree = await serialize(frame ?? sel, cats);
  const hit = findNode(tree, sel.id);
  if (!hit) return post({ type: "analysis", data: null });
  const current = annotationTexts(hit.node);
  if (overrides) {
    hit.node.annotations = [
      ...(hit.node.annotations ?? []).filter(
        (a) => !["osc", "depends on"].includes((a.category ?? "").toLowerCase()),
      ),
      ...(overrides.osc.trim() ? [{ category: "OSC", text: overrides.osc }] : []),
      ...(overrides.dependsOn.trim()
        ? [{ category: "Depends on", text: overrides.dependsOn }]
        : []),
    ];
    delete hit.node.plugin;
  }
  const result = mapFrame(frame ? bodyOf(tree) : tree, { where: frame?.name });
  const inside = new Set<string>();
  walk(hit.node, (n) => void inside.add(n.id));
  const around = new Set([...inside, ...hit.path.map((p) => p.id)]);
  const controls = result.controls
    .filter((c) => around.has(c.nodeId))
    .map((c) => {
      const parsed = Control.safeParse(c.control);
      return {
        nodeId: c.nodeId,
        component: c.component,
        idFrom: c.idFrom,
        control: c.control,
        schema: parsed.success
          ? []
          : parsed.error.issues.map((i) => `${i.path.join(".") || "control"}: ${i.message}`),
      };
    });
  const issues = result.issues.filter((i) => !i.nodeId || around.has(i.nodeId));
  post({
    type: "analysis",
    data: {
      selection: { id: sel.id, name: sel.name, type: sel.type, component: hit.node.component },
      frame: frame?.name,
      controls,
      issues,
      osc: current.osc ?? "",
      dependsOn: current.dependsOn ?? "",
      canEdit: figma.editorType === "figma" && "annotations" in sel,
      preview: !!overrides,
    },
  });
}

async function categoryId(key: keyof typeof CATEGORIES): Promise<string> {
  const want = CATEGORIES[key];
  const cats = await figma.annotations.getAnnotationCategoriesAsync();
  const found = cats.find((c) => c.label === want.label);
  if (found) return found.id;
  const made = await figma.annotations.addAnnotationCategoryAsync({
    label: want.label,
    color: want.color,
  });
  return made.id;
}

async function save(osc: string, dependsOn: string) {
  const sel = figma.currentPage.selection[0];
  if (!sel || !("annotations" in sel)) throw new Error("Select a layer that can carry annotations");
  const oscId = await categoryId("osc");
  const depId = await categoryId("dependsOn");
  const keep = sel.annotations.filter((a) => a.categoryId !== oscId && a.categoryId !== depId);
  const next: Annotation[] = [...keep];
  if (osc.trim()) next.push({ labelMarkdown: osc.trim(), categoryId: oscId });
  if (dependsOn.trim()) next.push({ labelMarkdown: dependsOn.trim(), categoryId: depId });
  sel.annotations = next;
  sel.setSharedPluginData(NAMESPACE, "osc", osc.trim());
  sel.setSharedPluginData(NAMESPACE, "dependsOn", dependsOn.trim());
}

async function snapshot(): Promise<Snapshot> {
  const cats = await categoryLabels();
  const brand = await brandContext();
  const page = figma.currentPage;
  await page.loadAsync();
  const nodes: FNode[] = [];
  for (const c of page.children) nodes.push(await serialize(c, cats, brand));
  const pageMode = brandModeOf(page, brand);
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    source: `Otakoyi Inspector, ${new Date().toISOString()}`,
    fileKey: figma.fileKey,
    page: { id: page.id, name: page.name, ...(pageMode ? { brandMode: pageMode } : {}) },
    ...(brand ? { brand: brand.snapshot } : {}),
    nodes,
  };
}

figma.ui.onmessage = async (msg: FromUi) => {
  try {
    if (msg.type === "refresh") await analyze();
    else if (msg.type === "check") await analyze({ osc: msg.osc, dependsOn: msg.dependsOn });
    else if (msg.type === "save") {
      await save(msg.osc, msg.dependsOn);
      post({ type: "saved" });
      await analyze();
    } else if (msg.type === "snapshot") {
      const s = await snapshot();
      post({
        type: "snapshot",
        name: `${s.page.name}.snapshot.json`,
        json: JSON.stringify(s, null, 2),
      });
    }
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};

figma.on(
  "selectionchange",
  () => void analyze().catch((e) => post({ type: "error", message: String(e) })),
);
void analyze();
