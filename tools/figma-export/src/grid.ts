/**
 * Frame geometry → 12-column grid placements (schema `layout.phone` / `layout.tablet`).
 *
 * Columns: each control's left and right edges are scaled from the bounding box of all controls in
 * the frame to 0..12 and rounded. Rows: a uniform row unit (the height of the shortest control,
 * clamped to ROW_MIN..ROW_MAX pt) and the same edge rounding, so grid heights stay proportional to
 * the drawn heights (the renderer gives every row the same height). Rounding edges, not sizes,
 * keeps neighbours from overlapping.
 */
import type { Grid } from "@osc/schema";

export const COLUMNS = 12;
export const ROW_MIN = 32;
export const ROW_MAX = 96;

export interface Placed {
  id: string;
  box?: [number, number, number, number];
}

export function gridFor(items: Placed[]): Map<string, Grid> {
  const out = new Map<string, Grid>();
  const boxed = items.filter((i) => i.box);
  if (!boxed.length) {
    items.forEach((i, y) => out.set(i.id, { x: 0, y, w: COLUMNS, h: 1 }));
    return out;
  }
  const minX = Math.min(...boxed.map((i) => i.box![0]));
  const maxX = Math.max(...boxed.map((i) => i.box![0] + i.box![2]));
  const width = Math.max(1, maxX - minX);
  const minY = Math.min(...boxed.map((i) => i.box![1]));
  const unit = Math.min(ROW_MAX, Math.max(ROW_MIN, Math.min(...boxed.map((i) => i.box![3]))));
  const rowEdge = (y: number) => Math.round((y - minY) / unit);
  const maxRow = Math.max(...boxed.map((i) => rowEdge(i.box![1] + i.box![3])));
  let nextRow = maxRow;
  for (const i of items) {
    if (!i.box) {
      out.set(i.id, { x: 0, y: nextRow++, w: COLUMNS, h: 1 });
      continue;
    }
    const [x, y, w, h] = i.box;
    let l = Math.round(((x - minX) / width) * COLUMNS);
    let r = Math.round(((x + w - minX) / width) * COLUMNS);
    l = Math.min(Math.max(l, 0), COLUMNS - 1);
    r = Math.min(Math.max(r, l + 1), COLUMNS);
    const top = rowEdge(y);
    const bottom = Math.max(top + 1, rowEdge(y + h));
    out.set(i.id, { x: l, y: top, w: r - l, h: bottom - top });
  }
  // Drop rows no control covers (gaps between cards in the frame): the pult has no empty rows.
  const covered = new Set<number>();
  for (const g of out.values()) for (let r = g.y; r < g.y + g.h; r++) covered.add(r);
  const rows = [...covered].sort((a, b) => a - b);
  const index = new Map(rows.map((r, i) => [r, i]));
  for (const [id, g] of out) out.set(id, { ...g, y: index.get(g.y)! });
  return out;
}

/** Bottom of a layout (first free row). */
export function bottomOf(placements: Iterable<Grid>): number {
  let b = 0;
  for (const g of placements) b = Math.max(b, g.y + g.h);
  return b;
}
