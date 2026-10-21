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
