import { ThemeProvider } from "@osc/ui";
import * as React from "react";
import { InstallationContent } from "@/components/InstallationContent";
import { useApp, useSessionState } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { closeSheet } from "@/lib/navigation";

/** Installation on iPhone: a system sheet (large detent). On iPad it is the pult's inspector. */
export default function Installation() {
  const app = useApp();
  const s = useSessionState();
  const brand = useBrand();
  return (
    <ThemeProvider brand={brand.theme}>
      <InstallationContent
        pultId={app.pultId ?? s.config?.pults[0]?.id ?? null}
        onPult={(id) => {
          app.setPultId(id);
          closeSheet();
        }}
        onClose={closeSheet}
      />
    </ThemeProvider>
  );
}
