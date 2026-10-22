/**
 * Brand assets of a config (`theme.logo`, `theme.splash`): an http(s) URL is used as is; a
 * relative path is in the config's asset bundle — served by the bridge at `/brand/<path>`, or
 * bundled with the app for the demo installation.
 */
export type AssetSource = { uri: string } | number;

export function resolveAsset(
  path: string | undefined,
  o: { httpBase?: string | undefined; bundled?: Readonly<Record<string, number>> },
): AssetSource | null {
  if (!path) return null;
  const p = path.trim();
  if (/^https?:\/\//i.test(p)) return { uri: p };
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return null; // no other schemes (javascript:, file:, data:)
  const rel = p.replace(/^\.?\/+/, "");
  if (rel.split("/").some((s) => s === "..")) return null;
  const bundled = o.bundled?.[rel];
  if (bundled !== undefined) return bundled;
  if (!o.httpBase) return null;
  return {
    uri: `${o.httpBase.replace(/\/$/, "")}/brand/${rel.split("/").map(encodeURIComponent).join("/")}`,
  };
}
