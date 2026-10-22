import { ThemeProvider } from "@osc/ui";
import { router } from "expo-router";
import * as React from "react";
import { SettingsContent } from "@/components/SettingsContent";
import { useApp } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { closeSheet, resetTo } from "@/lib/navigation";

/** Settings: a system sheet on iPhone (large detent, grabber), a form sheet on iPad (ADR-013). */
export default function Settings() {
  const app = useApp();
  const brand = useBrand();
  return (
    <ThemeProvider brand={brand.theme}>
      <SettingsContent
        onClose={closeSheet}
        onShowPairing={() => router.push({ pathname: "/dialog", params: { kind: "pairing" } })}
        onLeave={() => {
          void app.leave();
          resetTo("/connect");
        }}
      />
    </ThemeProvider>
  );
}
