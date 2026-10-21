import { router } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { useApp } from "@/lib/app-context";
import { findBridge, pinFromUrl } from "@/lib/bridge";

/**
 * Launch (ADR-012). A plain background matching the first screen while it decides where to go:
 * - a web pult served by a bridge connects to that bridge;
 * - a device with a saved pairing reconnects to it;
 * - otherwise Connect (scan QR / enter address and PIN / try the demo).
 */
export default function Launch() {
  const app = useApp();
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (app.session) return router.replace(app.session.state.config ? "/pult" : "/loading");
      const served = await findBridge();
      const saved = await app.loadSaved();
      if (cancelled) return;
      if (served) {
        const same = saved?.bridge === served;
        await app.connect(
          {
            bridge: served,
            pin: pinFromUrl() ?? (same ? saved?.pin : undefined),
            name: same ? saved?.name : undefined,
          },
          same ? saved?.brand : undefined,
        );
        return router.replace("/loading");
      }
      if (saved) {
        await app.connect(saved, saved.brand);
        return router.replace("/loading");
      }
      router.replace("/connect");
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per launch.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <View className="bg-background flex-1" />;
}
