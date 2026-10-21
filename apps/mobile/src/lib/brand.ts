import type { Theme } from "@osc/schema";
import { httpBaseOf } from "@osc/protocol";
import { useApp, useSessionState } from "./app-context";
import { resolveAsset, type AssetSource } from "./assets";
import { DEMO_ASSETS } from "./demo";

/**
 * The brand to draw with (ADR-004: only from the config — there is no client UI for it): the
 * connected installation's theme, else the one saved with the pairing, else the studio default.
 */
export function useBrand(): {
  theme: Theme | undefined;
  name: string;
  logo: AssetSource | null;
  splash: AssetSource | null;
} {
  const { session, savedBrand } = useApp();
  const s = useSessionState();
  const theme = s.config?.theme ?? savedBrand?.theme;
  const name = s.config?.installation.name ?? savedBrand?.name ?? session?.displayName ?? "";
  const opts = {
    httpBase: session?.bridge ? httpBaseOf(session.bridge) : undefined,
    bundled: session?.kind === "demo" ? DEMO_ASSETS : undefined,
  };
  return {
    theme,
    name,
    logo: resolveAsset(theme?.logo, opts),
    splash: resolveAsset(theme?.splash, opts),
  };
}
