import { ThemeProvider } from "@osc/ui";
import * as React from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import {
  INSTALLATION_TITLE,
  InstallationContent,
  type InstallationView,
} from "@/components/InstallationContent";
import { SheetSurface, SheetTop } from "@/components/SheetTop";
import { useApp, useSessionState } from "@/lib/app-context";
import { currentPult, formFactorOf } from "@/lib/nav";
import { useBrand } from "@/lib/brand";
import { closeSheet } from "@/lib/navigation";

/** Installation on iPhone: a system sheet (large detent). On iPad it is the pult's inspector. */
export default function Installation() {
  const app = useApp();
  const s = useSessionState();
  const brand = useBrand();
  const [view, setView] = React.useState<InstallationView>("main");
  const ff = formFactorOf(useWindowDimensions().width);
  return (
    <ThemeProvider brand={brand.theme}>
      <SheetSurface>
        <SheetTop
          title={INSTALLATION_TITLE[view]}
          onBack={view !== "main" ? () => setView("main") : undefined}
          onClose={closeSheet}
        />
        <ScrollView contentContainerClassName="px-4 pb-10 pt-4">
          <InstallationContent
            view={view}
            onView={setView}
            pultId={currentPult(s.config?.pults ?? [], app.pultId, ff)?.id ?? null}
            onPult={(id) => {
              app.setPultId(id);
              closeSheet();
            }}
          />
        </ScrollView>
      </SheetSurface>
    </ThemeProvider>
  );
}
