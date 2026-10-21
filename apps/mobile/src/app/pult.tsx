import { ControlServicesProvider, PultPager, PultProvider, ThemeProvider } from "@osc/ui";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import * as React from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Inspector } from "@/components/ds/Inspector";
import { EdgeSwipes } from "@/components/EdgeSwipes";
import { InstallationContent } from "@/components/InstallationContent";
import { PreviewPanel } from "@/components/PreviewPanel";
import { DemoBanner, PultHeaderBar, type Connection } from "@/components/PultHeaderBar";
import { useApp, useSessionState } from "@/lib/app-context";
import { INSPECTOR_WIDTH, formFactorOf, presentationOf, type Panel } from "@/lib/nav";
import { bridgeServices } from "@/lib/services";
import { resetTo } from "@/lib/navigation";
import { installationOnline } from "@/lib/session";

/**
 * The console (pult). Minimal header (ADR-013): Settings leading, status, Installation trailing;
 * edge swipes are shortcuts. iPhone: both open as sheets. iPad: Settings is a form sheet,
 * Installation a 390 pt inspector over the console (no dimming). The demo adds its banner and the
 * live Preview of the simulated installation.
 */
export default function PultScreen() {
  const app = useApp();
  const s = useSessionState();
  const { width, height } = useWindowDimensions();
  const ff = formFactorOf(width);
  const [inspector, setInspector] = React.useState(false);
  const session = app.session;
  const config = s.config;

  // Operators must not lose the screen mid-show (Settings → Keep screen awake). Native only.
  React.useEffect(() => {
    if (Platform.OS === "web" || !app.prefs.keepAwake) return;
    activateKeepAwakeAsync("pult").catch(() => {});
    return () => void deactivateKeepAwake("pult").catch(() => {});
  }, [app.prefs.keepAwake]);

  // Connection lost: a dialog sheet (not an alert); it reconnects by itself meanwhile.
  React.useEffect(() => {
    if (s.lost && session?.kind === "bridge")
      router.push({ pathname: "/dialog", params: { kind: "lost" } });
  }, [s.lost, session]);

  React.useEffect(() => {
    if (!session) router.replace("/connect");
    else if (!config) router.replace("/loading");
  }, [session, config]);

  const services = React.useMemo(() => (session ? bridgeServices(session.http) : null), [session]);
  const pult = config?.pults.find((p) => p.id === app.pultId) ?? config?.pults[0];
  const store = pult ? session?.stores.get(pult.id) : undefined;
  const pultServices = React.useMemo(
    () => (services && pult ? { ...services, pult: pult.id } : null),
    [services, pult],
  );
  if (!session || !config || !pult || !store || !pultServices)
    return <View className="bg-background flex-1" />;

  const open = (panel: Panel) => {
    const how = presentationOf(panel, ff);
    if (how === "inspector") return setInspector((v) => !v);
    router.push(panel === "settings" ? "/settings" : "/installation");
  };
  const connection: Connection =
    s.connection !== "open" ? "offline" : installationOnline(s) ? "online" : "connecting";
  const demo = session.kind === "demo";
  const previewH = Math.round(Math.min(220, Math.max(120, height * (ff === "phone" ? 0.2 : 0.24))));

  return (
    <ThemeProvider brand={config.theme}>
      <PultProvider store={store}>
        <ControlServicesProvider value={pultServices}>
          <SafeAreaView className="flex-1" edges={["top", "left", "right", "bottom"]}>
            <View className="flex-1">
              <PultHeaderBar
                name={config.installation.name}
                pultName={config.pults.length > 1 ? pult.name : undefined}
                connection={connection}
                mode={session.controlMode()}
                inspectorOpen={inspector}
                onSettings={() => open("settings")}
                onInstallation={() => open("installation")}
                onTakeControl={() => session.take()}
              />
              {demo && (
                <DemoBanner
                  onExit={() => {
                    void app.leave();
                    resetTo("/connect");
                  }}
                />
              )}
              {demo && app.sim && (
                <View className="px-4 pt-2" style={{ height: previewH }}>
                  <PreviewPanel sim={app.sim} />
                </View>
              )}
              <PultPager key={pult.id} pages={pult.pages} />
            </View>
          </SafeAreaView>
          <EdgeSwipes ff={ff} onOpen={open} />
          {ff === "tablet" && inspector && (
            <Inspector width={INSPECTOR_WIDTH}>
              <InstallationContent
                pultId={pult.id}
                onPult={app.setPultId}
                onClose={() => setInspector(false)}
              />
            </Inspector>
          )}
        </ControlServicesProvider>
      </PultProvider>
    </ThemeProvider>
  );
}
