export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Below this width (pt) a page is re-flowed for phones. */
export const PHONE_BREAKPOINT = 600;

/**
 * Phone layout derived from the tablet grid: every control keeps its reading order (top-to-bottom,
 * left-to-right) and takes half a row (narrow controls) or a full row (wide ones), then controls are
 * packed into 12 columns. Halves pair up, so the phone screen fills without gaps.
 * The builder can later store an explicit phone layout; until then this keeps any config usable.
 */
export function reflowForPhone<T extends { id: string; grid: Cell }>(
  controls: T[],
  cols = 12,
): Map<string, Cell> {
  const ordered = [...controls].sort((a, b) => a.grid.y - b.grid.y || a.grid.x - b.grid.x);
  const height: number[] = Array(cols).fill(0); // skyline: next free row per column
  const out = new Map<string, Cell>();
  for (const c of ordered) {
    const half = cols / 2;
    const w = c.grid.w * 2 <= half ? half : cols;
    // Lowest position where the control fits, preferring the left-most column.
    let best = { x: 0, y: Infinity };
    for (let x = 0; x + w <= cols; x++) {
      const y = Math.max(...height.slice(x, x + w));
      if (y < best.y) best = { x, y };
    }
    const cell = { x: best.x, y: best.y, w, h: c.grid.h };
    for (let i = cell.x; i < cell.x + w; i++) height[i] = cell.y + cell.h;
    out.set(c.id, cell);
  }
  return out;
}

/** One horizontally swipeable screen of a page. `top` is the first grid row it shows. */
export interface Screen {
  ids: string[];
  top: number;
  rows: number;
}

/**
 * Splits a page into screens so nothing ever scrolls vertically.
 * Controls that share rows form a band; bands are never cut. Bands are packed into screens of at
 * most `maxRows` rows (the rows that fit the viewport at the minimum row height). A single band
 * taller than `maxRows` gets a screen of its own and is squeezed to fit.
 */
export function paginate(cells: Map<string, Cell>, maxRows: number): Screen[] {
  const items = [...cells.entries()].sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
  const bands: Array<{ top: number; bottom: number; ids: string[] }> = [];
  for (const [id, c] of items) {
    const last = bands.at(-1);
    if (last && c.y < last.bottom) {
      last.bottom = Math.max(last.bottom, c.y + c.h);
      last.ids.push(id);
    } else bands.push({ top: c.y, bottom: c.y + c.h, ids: [id] });
  }
  const screens: Screen[] = [];
  for (const b of bands) {
    const cur = screens.at(-1);
    if (cur && b.bottom - cur.top <= Math.max(1, maxRows)) {
      cur.ids.push(...b.ids);
      cur.rows = b.bottom - cur.top;
    } else screens.push({ ids: [...b.ids], top: b.top, rows: b.bottom - b.top });
  }
  return screens.length ? screens : [{ ids: [], top: 0, rows: 1 }];
}
