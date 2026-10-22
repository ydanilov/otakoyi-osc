/**
 * Figma plugin API nodes → exporter snapshot nodes (`FNode`), the same shape the REST converter and
 * the test fixtures use, so the plugin runs exactly the exporter's mapping.
 */
import type { FAnnotation, FNode, Snapshot } from "@osc/figma-export";

const SKIP = new Set<string>([
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "BOOLEAN_OPERATION",
  "LINE",
  "STAR",
  "POLYGON",
  "SLICE",
]);
const LEAF = /^(Icon\/|Status Bar|Home Indicator|Status bar|Page Dots|Pult Header)/;
const BOXED = new Set<string>(["FRAME", "INSTANCE", "SECTION", "GROUP", "COMPONENT"]);

export const NAMESPACE = "otakoyi";

/** Annotation category id → label. */
export async function categoryLabels(): Promise<Map<string, string>> {
  const cats = await figma.annotations.getAnnotationCategoriesAsync();
  return new Map(cats.map((c) => [c.id, c.label]));
}

/** The file's `Brand` variable collection: its modes (one per client) and their colours. */
export interface BrandContext {
  collectionId: string;
  modeNames: Map<string, string>;
  snapshot: NonNullable<Snapshot["brand"]>;
}

const hex = (c: RGB | RGBA) =>
  "#" +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();

/** Reads the `Brand` collection (Variables are local to the file; REST needs Enterprise). */
export async function brandContext(): Promise<BrandContext | undefined> {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const col = cols.find((c) => c.name === "Brand");
  if (!col) return undefined;
  const modes: Record<string, Record<string, string>> = {};
  const modeNames = new Map(col.modes.map((m) => [m.modeId, m.name]));
  for (const m of col.modes) modes[m.name] = {};
  for (const id of col.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v || v.resolvedType !== "COLOR") continue;
    for (const m of col.modes) {
      let val: VariableValue | undefined = v.valuesByMode[m.modeId];
      // Follow aliases (in their own collection's default mode).
      for (
        let i = 0;
        i < 5 && val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS";
        i++
      ) {
        const target = await figma.variables.getVariableByIdAsync((val as VariableAlias).id);
        const tc = target
          ? await figma.variables.getVariableCollectionByIdAsync(target.variableCollectionId)
          : null;
        val = target && tc ? target.valuesByMode[tc.defaultModeId] : undefined;
      }
      if (val && typeof val === "object" && "r" in val) modes[m.name]![v.name] = hex(val);
    }
  }
  return {
    collectionId: col.id,
    modeNames,
    snapshot: {
      collection: col.name,
      defaultMode: modeNames.get(col.defaultModeId) ?? col.modes[0]!.name,
      modes,
    },
  };
}

/** The Brand mode explicitly set on a node (section, frame or page), if any. */
export function brandModeOf(
  n: SceneNode | PageNode,
  brand: BrandContext | undefined,
): string | undefined {
  if (!brand || !("explicitVariableModes" in n)) return undefined;
  const id = n.explicitVariableModes[brand.collectionId];
  return id ? brand.modeNames.get(id) : undefined;
}

export async function serialize(
  n: SceneNode | PageNode,
  cats: Map<string, string>,
  brand?: BrandContext,
): Promise<FNode> {
  const o: FNode = { id: n.id, name: n.name, type: n.type };
  const mode = (n.type === "SECTION" || n.type === "FRAME") && brandModeOf(n, brand);
  if (mode) o.brandMode = mode;
  if ("visible" in n && n.visible === false) o.visible = false;
  const b = "absoluteBoundingBox" in n ? n.absoluteBoundingBox : null;
  if (b && BOXED.has(n.type))
    o.box = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
  if (n.type === "TEXT") o.text = n.characters;
  let leaf = false;
  if (n.type === "INSTANCE") {
    const mc = await n.getMainComponentAsync();
    if (mc) {
      const set = mc.parent?.type === "COMPONENT_SET" ? mc.parent : null;
      o.component = set ? set.name : mc.name;
      leaf = LEAF.test(o.component);
    }
    const props: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(n.componentProperties)) {
      if (v.type === "INSTANCE_SWAP") continue;
      props[k.split("#")[0]!] = v.value;
    }
    if (Object.keys(props).length) o.props = props;
  }
  if ("annotations" in n && n.annotations.length) {
    o.annotations = n.annotations.map((a): FAnnotation => ({
      category: (a.categoryId && cats.get(a.categoryId)) || null,
      text: a.labelMarkdown || a.label || "",
    }));
  }
  if ("getSharedPluginDataKeys" in n) {
    const keys = n.getSharedPluginDataKeys(NAMESPACE);
    if (keys.length)
      o.plugin = Object.fromEntries(
        keys.sort().map((k) => [k, n.getSharedPluginData(NAMESPACE, k)]),
      );
  }
  if (!leaf && "children" in n) {
    const kids: FNode[] = [];
    for (const c of n.children) if (!SKIP.has(c.type)) kids.push(await serialize(c, cats, brand));
    if (kids.length) o.children = kids;
  }
  return o;
}

/** The top-level frame (child of the page or of a section) that contains `node`. */
export function pultFrameOf(node: BaseNode): FrameNode | ComponentNode | undefined {
  let cur: BaseNode | null = node;
  while (cur && cur.parent) {
    const p: BaseNode = cur.parent;
    if (
      (p.type === "PAGE" || p.type === "SECTION") &&
      (cur.type === "FRAME" || cur.type === "COMPONENT")
    )
      return cur;
    cur = p;
  }
  return undefined;
}
