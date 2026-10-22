/**
 * The exporter's input: a plain-JSON snapshot of a Figma page (or a part of it).
 *
 * Three producers write the same shape, so the mapping never depends on where the tree came from:
 * - `rest.ts` converts a Figma REST API response (`GET /v1/files/:key/nodes`);
 * - the Otakoyi Inspector plugin serializes the current page ("Export snapshot");
 * - test fixtures (`fixtures/*.json`) are saved snapshots.
 */

export const SNAPSHOT_FORMAT = "otakoyi-figma-snapshot";

/** A Dev Mode annotation on a node. `category` is the category label ("OSC", "Depends on"). */
export interface FAnnotation {
  category: string | null;
  /** Markdown (`labelMarkdown`) when Figma has it, else the plain label. */
  text: string;
}

export interface FNode {
  id: string;
  /** Layer name. For a control instance it is the control id (ADR-014). */
  name: string;
  /** Figma node type: FRAME, INSTANCE, TEXT, SECTION, SLOT, GROUP, … */
  type: string;
  /** Present (false) only for hidden layers. */
  visible?: boolean;
  /** Absolute bounding box `[x, y, width, height]`. */
  box?: [number, number, number, number];
  /** TEXT nodes: the characters. */
  text?: string;
  /** INSTANCE nodes: name of the component set (or of the component when it has no set). */
  component?: string;
  /**
   * INSTANCE nodes: component properties with the `#id` suffix stripped — variant values
   * (`Mode`, `Orientation`, `State`, `Size`, …), text properties (`Label`, `Value`, …) and booleans.
   */
  props?: Record<string, string | boolean>;
  annotations?: FAnnotation[];
  /** Shared plugin data in the `otakoyi` namespace (`osc`, `dependsOn`), mirrored by the Inspector. */
  plugin?: Record<string, string>;
  /** Explicit mode of the Figma `Brand` variable collection set on this node (section / frame). */
  brandMode?: string;
  children?: FNode[];
}

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: 1;
  /** Free text: how and when the snapshot was made. */
  source?: string;
  fileKey?: string;
  page: { id: string; name: string; brandMode?: string };
  /**
   * The Figma `Brand` variable collection: one mode per client (`brand/*` → hex). The REST
   * Variables API is Enterprise-only, so the Inspector's Export snapshot carries it.
   */
  brand?: {
    collection: string;
    defaultMode: string;
    modes: Record<string, Record<string, string>>;
  };
  /** Top-level nodes of the page (sections and frames). */
  nodes: FNode[];
}

export function isSnapshot(v: unknown): v is Snapshot {
  const s = v as Partial<Snapshot> | null;
  return !!s && s.format === SNAPSHOT_FORMAT && s.version === 1 && Array.isArray(s.nodes);
}

/** Depth-first walk; `visit` returns false to skip a node's children. */
export function walk(node: FNode, visit: (n: FNode, parents: FNode[]) => boolean | void): void {
  const rec = (n: FNode, parents: FNode[]) => {
    if (visit(n, parents) === false) return;
    for (const c of n.children ?? []) rec(c, [...parents, n]);
  };
  rec(node, []);
}

export function findFirst(node: FNode, pred: (n: FNode) => boolean): FNode | undefined {
  let found: FNode | undefined;
  walk(node, (n) => {
    if (found) return false;
    if (pred(n)) {
      found = n;
      return false;
    }
  });
  return found;
}

/** Text of the first TEXT descendant with this layer name (e.g. a component's "Label"). */
export function textOf(node: FNode, layerName: string): string | undefined {
  return findFirst(node, (n) => n.type === "TEXT" && n.name === layerName)?.text;
}
