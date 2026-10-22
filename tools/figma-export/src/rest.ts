/**
 * Figma REST API → snapshot. Needs a personal access token (`FIGMA_ACCESS_TOKEN`) with
 * `file_content:read`; `fetch` is injectable for tests.
 *
 * Shared plugin data (`otakoyi` namespace) is requested with `plugin_data=shared`: the Otakoyi
 * Inspector mirrors every OSC / Depends on annotation it edits there, so the REST path sees them
 * even where the REST API does not return Dev Mode annotations.
 */
import { SNAPSHOT_FORMAT, type FAnnotation, type FNode, type Snapshot } from "./snapshot";

const API = "https://api.figma.com/v1";
const SKIP = new Set([
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "BOOLEAN_OPERATION",
  "LINE",
  "STAR",
  "REGULAR_POLYGON",
  "SLICE",
]);
/** Instances kept without children (their insides are not config). */
const LEAF = /^(Icon\/|Status Bar|Home Indicator|Status bar|Page Dots|Pult Header)/;

type Fetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

interface RestNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  characters?: string;
  componentId?: string;
  componentProperties?: Record<string, { type: string; value: string | boolean }>;
  sharedPluginData?: Record<string, Record<string, string>>;
  annotations?: {
    label?: string;
    labelMarkdown?: string;
    categoryId?: string;
    category?: { label?: string };
  }[];
  children?: RestNode[];
}

export interface RestComponents {
  components?: Record<string, { name: string; componentSetId?: string }>;
  componentSets?: Record<string, { name: string }>;
  /** Annotation category id → label, when known. */
  categories?: Record<string, string>;
}

export function restNodeToSnapshot(n: RestNode, meta: RestComponents): FNode {
  const o: FNode = { id: n.id, name: n.name, type: n.type };
  if (n.visible === false) o.visible = false;
  const b = n.absoluteBoundingBox;
  if (b) o.box = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
  if (n.type === "TEXT" && typeof n.characters === "string") o.text = n.characters;
  let leaf = false;
  if (n.type === "INSTANCE") {
    const comp = n.componentId ? meta.components?.[n.componentId] : undefined;
    const set = comp?.componentSetId ? meta.componentSets?.[comp.componentSetId] : undefined;
    o.component = set?.name ?? comp?.name;
    leaf = !!o.component && LEAF.test(o.component);
    const props: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(n.componentProperties ?? {})) {
      if (v.type === "INSTANCE_SWAP") continue;
      props[k.split("#")[0]!] = v.value;
    }
    if (Object.keys(props).length) o.props = props;
  }
  const ann: FAnnotation[] = (n.annotations ?? []).map((a) => ({
    category:
      a.category?.label ?? (a.categoryId ? (meta.categories?.[a.categoryId] ?? null) : null),
    text: a.labelMarkdown ?? a.label ?? "",
  }));
  if (ann.length) o.annotations = ann;
  const plugin = n.sharedPluginData?.otakoyi;
  if (plugin && Object.keys(plugin).length) o.plugin = { ...plugin };
  if (!leaf && n.children?.length) {
    const kids = n.children
      .filter((c) => !SKIP.has(c.type))
      .map((c) => restNodeToSnapshot(c, meta));
    if (kids.length) o.children = kids;
  }
  return o;
}

async function get(f: Fetch, token: string, path: string): Promise<unknown> {
  const res = await f(`${API}${path}`, { headers: { "X-Figma-Token": token } });
  if (!res.ok)
    throw new Error(`Figma API ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Fetch a page (by name or id) of a Figma file as a snapshot. */
export async function fetchSnapshot(o: {
  fileKey: string;
  page: string;
  token: string;
  fetch?: Fetch;
}): Promise<Snapshot> {
  const f = o.fetch ?? (globalThis.fetch as unknown as Fetch);
  const file = (await get(f, o.token, `/files/${o.fileKey}?depth=1`)) as {
    document: { children: { id: string; name: string }[] };
  };
  const pages = file.document.children;
  const page =
    pages.find((p) => p.id === o.page || p.name === o.page) ??
    pages.find((p) => p.name.toLowerCase().includes(o.page.toLowerCase()));
  if (!page)
    throw new Error(`page "${o.page}" not found; pages: ${pages.map((p) => p.name).join(", ")}`);
  const res = (await get(
    f,
    o.token,
    `/files/${o.fileKey}/nodes?ids=${encodeURIComponent(page.id)}&plugin_data=shared`,
  )) as {
    nodes: Record<string, { document: RestNode } & RestComponents>;
  };
  const entry = res.nodes[page.id];
  if (!entry) throw new Error(`Figma API returned no node for page ${page.id}`);
  const root = restNodeToSnapshot(entry.document, entry);
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    source: `Figma REST API, ${new Date().toISOString()}`,
    fileKey: o.fileKey,
    page: { id: page.id, name: page.name },
    nodes: root.children ?? [],
  };
}
