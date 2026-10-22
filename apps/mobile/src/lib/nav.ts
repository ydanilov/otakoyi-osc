/**
 * Navigation rules of ADR-013 (Apple HIG), as pure functions.
 * - Header: Settings leading, Installation trailing — always the way in.
 * - Edge swipes are shortcuts only: right edge → Installation (phone and tablet); left edge →
 *   Settings on phone only (on iPad the leading edge belongs to the system).
 * - iPhone: both open as sheets. iPad (≥ 768 pt): Settings is a form sheet, Installation a
 *   390 pt trailing inspector over the console (no dimming).
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

/** How a panel is presented on this form factor. */
export function presentationOf(panel: Panel, ff: FormFactor): "sheet" | "formSheet" | "inspector" {
  if (ff === "phone") return "sheet";
  return panel === "installation" ? "inspector" : "formSheet";
}
