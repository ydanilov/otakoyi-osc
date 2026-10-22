import { ThemeProvider } from "@osc/ui";
import * as React from "react";
import { ScrollView } from "react-native";
import {
  INSTALLATION_TITLE,
  InstallationContent,
  type InstallationView,
} from "@/components/InstallationContent";
import { SheetTop } from "@/components/SheetTop";
import { useApp, useSessionState } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { closeSheet } from "@/lib/navigation";

/** Installation on iPhone: a system sheet (large detent). On iPad it is the pult's inspector. */
export default function Installation() {
  const app = useApp();
  const s = useSessionState();
  const brand = useBrand();
  const [view, setView] = React.useState<InstallationView>("main");
  return (
    <ThemeProvider brand={brand.theme}>
      <SheetTop
        title={INSTALLATION_TITLE[view]}
        onBack={view !== "main" ? () => setView("main") : undefined}
        onClose={closeSheet}
      />
      <ScrollView contentContainerClassName="px-4 pb-10 pt-2">
        <InstallationContent
          view={view}
          onView={setView}
          pultId={app.pultId ?? s.config?.pults[0]?.id ?? null}
          onPult={(id) => {
            app.setPultId(id);
            closeSheet();
          }}
        />
      </ScrollView>
    </ThemeProvider>
  );
}
