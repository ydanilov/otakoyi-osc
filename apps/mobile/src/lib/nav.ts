/**
 * Navigation rules of ADR-013 (Apple HIG), as pure functions.
 * - Header: Settings leading, Installation trailing — always the way in.
 * - Edge swipes are shortcuts only: right edge → Installation (phone and tablet); left edge →
 *   Settings on phone only (on iPad the leading edge belongs to the system).
 * - iPhone: both open as sheets. iPad (≥ 768 pt): Settings is a 400 pt drawer from the left over
 *   the dimmed console, Installation a 390 pt trailing inspector over the console (no dimming).
 */

/** From this width (pt) the app uses the iPad presentation. */
export const TABLET_MIN_WIDTH = 768;
/** Width of the Installation inspector on iPad. */
export const INSPECTOR_WIDTH = 390;
/** Width of the edge strips that catch the swipe, pt. */
export const EDGE_WIDTH = 20;
/** Distance a swipe from the edge must travel to open the panel, pt. */
export const EDGE_SWIPE_MIN = 48;

export type FormFactor = "phone" | "tablet";
export type Panel = "settings" | "installation";
export type Edge = "left" | "right";

export function formFactorOf(width: number): FormFactor {
  return width >= TABLET_MIN_WIDTH ? "tablet" : "phone";
}

/** Which panel an edge opens on this form factor (null: the edge is not ours). */
export function edgeTarget(edge: Edge, ff: FormFactor): Panel | null {
  if (edge === "right") return "installation";
  return ff === "phone" ? "settings" : null;
}

/** A finished swipe from an edge: open its panel when it went far enough inwards. */
export function edgeSwipe(edge: Edge, dx: number, ff: FormFactor): Panel | null {
  const inward = edge === "left" ? dx : -dx;
  return inward >= EDGE_SWIPE_MIN ? edgeTarget(edge, ff) : null;
}

/** How a panel is presented on this form factor (iPad Settings: the left drawer). */
export function presentationOf(panel: Panel, ff: FormFactor): "sheet" | "drawer" | "inspector" {
  if (ff === "phone") return "sheet";
  return panel === "installation" ? "inspector" : "drawer";
}

/**
 * The pult on screen: the one the user picked, else the first whose primary form factor
 * (`pult.formFactor`, ADR-013) is this device's, else the config's first.
 */
export function currentPult<P extends { id: string; formFactor?: FormFactor | undefined }>(
  pults: readonly P[],
  picked: string | null,
  ff: FormFactor,
): P | undefined {
  return pults.find((p) => p.id === picked) ?? pults.find((p) => p.formFactor === ff) ?? pults[0];
}

/** Rows of Installation › Pults (Figma): the current pult first ("current"), then "N screens". */
export function pultRows<
  P extends { id: string; name: string; icon?: string | undefined; pages: readonly unknown[] },
>(pults: readonly P[], currentId: string | undefined) {
  const cur = pults.filter((p) => p.id === currentId);
  const rest = pults.filter((p) => p.id !== currentId);
  return [...cur, ...rest].map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    current: p.id === currentId,
    value:
      p.id === currentId
        ? "current"
        : `${p.pages.length} ${p.pages.length === 1 ? "screen" : "screens"}`,
  }));
}
