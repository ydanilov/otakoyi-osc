import type { AnyControl, Cell } from "@osc/schema";

export { reflowForPhone, type Cell } from "@osc/schema";

/** Below this width (pt) the pult uses the page's phone layout. */
export const PHONE_BREAKPOINT = 600;

/** One horizontally swipeable screen of a page. `top` is the first grid row it shows. */
export interface Screen {
  ids: string[];
  top: number;
  rows: number;
}

/** Sizes (pt) the fixed-size controls need; from `@osc/tokens` (`theme.size`). */
export interface ControlSizes {
  padRegularH: number;
  padCompactH: number;
  picturePadRegular: number;
  picturePadCompact: number;
}

/**
 * Height (pt) a control needs in its grid cell, or undefined when it simply stretches. Pads with a
 * `size` keep their Figma size (150×88 / 104×64); picture pads are squares (168 / 120).
 */
export function minHeightFor(c: AnyControl, s: ControlSizes): number | undefined {
  if (c.type === "toggle" && c.style !== "switch" && c.image)
    return c.size === "compact" ? s.picturePadCompact : s.picturePadRegular;
  if ((c.type === "button" || (c.type === "toggle" && c.style !== "switch")) && c.size)
    return c.size === "compact" ? s.padCompactH : s.padRegularH;
  return undefined;
}

/** Viewport the screens are fitted to, and the controls that need a minimum height there. */
export interface Fit {
  /** Usable height of a screen, pt. */
  height: number;
  /** Gap between rows, pt. */
  gap: number;
  /** Control id → minimum height, pt (`minHeightFor`). */
  minHeight: ReadonlyMap<string, number>;
}

/** Do all controls of a screen of `rows` rows get their minimum height? */
function fits(ids: readonly string[], cells: Map<string, Cell>, rows: number, fit: Fit): boolean {
  const rowH = (fit.height - fit.gap * (rows - 1)) / rows;
  for (const id of ids) {
    const need = fit.minHeight.get(id);
    const c = cells.get(id);
    if (need === undefined || !c) continue;
    if (c.h * rowH + (c.h - 1) * fit.gap + 0.5 < need) return false;
  }
  return true;
}

/**
 * Splits a page into screens so nothing ever scrolls vertically.
 * Controls that share rows form a band; bands are never cut. Bands are packed into screens of at
 * most `maxRows` rows (the rows that fit the viewport at the minimum row height). A single band
 * taller than `maxRows` gets a screen of its own and is squeezed to fit. With `fit`, a band also
 * moves to the next screen when adding it would make the rows too short for a fixed-size control
 * (picture pads, sized pads) on that screen.
 */
export function paginate(cells: Map<string, Cell>, maxRows: number, fit?: Fit): Screen[] {
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
    const rows = cur ? b.bottom - cur.top : 0;
    if (
      cur &&
      rows <= Math.max(1, maxRows) &&
      (!fit || fits([...cur.ids, ...b.ids], cells, rows, fit))
    ) {
      cur.ids.push(...b.ids);
      cur.rows = b.bottom - cur.top;
    } else screens.push({ ids: [...b.ids], top: b.top, rows: b.bottom - b.top });
  }
  return screens.length ? screens : [{ ids: [], top: 0, rows: 1 }];
}
