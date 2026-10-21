import type { Cell } from "@osc/schema";

export { reflowForPhone, type Cell } from "@osc/schema";

/** Below this width (pt) the pult uses the page's phone layout. */
export const PHONE_BREAKPOINT = 600;

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
