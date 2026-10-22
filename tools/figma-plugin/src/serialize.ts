/**
 * Figma plugin API nodes → exporter snapshot nodes (`FNode`), the same shape the REST converter and
 * the test fixtures use, so the plugin runs exactly the exporter's mapping.
 */
import type { FAnnotation, FNode } from "@osc/figma-export";

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

export async function serialize(
  n: SceneNode | PageNode,
  cats: Map<string, string>,
): Promise<FNode> {
  const o: FNode = { id: n.id, name: n.name, type: n.type };
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
    for (const c of n.children) if (!SKIP.has(c.type)) kids.push(await serialize(c, cats));
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
