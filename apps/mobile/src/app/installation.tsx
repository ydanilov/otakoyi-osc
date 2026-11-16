import { SheetScaffold, SheetSurface, SheetToolbar, ThemeProvider } from "@osc/ui";
import { screenPults } from "@osc/schema";
import * as React from "react";
import { useWindowDimensions } from "react-native";
import {
  installationTitle,
  InstallationContent,
  type InstallationView,
} from "@/components/InstallationContent";
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
        {/* Figma Phone / 10 Installation (sheet) 104:8937: toolbar, then the content 16 pt below. */}
        <SheetScaffold
          header={
            <SheetToolbar
              title={installationTitle(view)}
              onBack={view !== "main" ? () => setView("main") : undefined}
              onClose={closeSheet}
            />
          }
          contentContainerClassName="px-4 pb-10 pt-4"
        >
          <InstallationContent
            view={view}
            onView={setView}
            pultId={currentPult(s.config ? screenPults(s.config) : [], app.pultId, ff)?.id ?? null}
            onPult={(id) => {
              app.setPultId(id);
              closeSheet();
            }}
          />
        </SheetScaffold>
      </SheetSurface>
    </ThemeProvider>
  );
}
