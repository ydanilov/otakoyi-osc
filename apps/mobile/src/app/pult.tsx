import {
  ControlServicesProvider,
  EdgeSwipe,
  Inspector,
  PultHeader,
  PultPager,
  PultProvider,
  ThemeProvider,
} from "@osc/ui";
import { httpBaseOf } from "@osc/protocol";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import * as React from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DemoBanner } from "@/components/DemoBanner";
import {
  INSTALLATION_TITLE,
  InstallationContent,
  type InstallationView,
} from "@/components/InstallationContent";
import { PreviewPanel } from "@/components/PreviewPanel";
import { useApp, useSessionState } from "@/lib/app-context";
import { edgeTarget, formFactorOf, presentationOf, type Panel } from "@/lib/nav";
import { resetTo } from "@/lib/navigation";
import { bridgeServices } from "@/lib/services";
import { installationOnline } from "@/lib/session";

/**
 * The console (pult). DS Pult Header (ADR-013): Settings leading, status, Installation trailing;
 * edge swipes are shortcuts. iPhone: both open as sheets. iPad: Settings is a form sheet,
 * Installation the DS Inspector (390 pt) over the console, no dimming. The demo adds its banner
 * and the live Preview of the simulated installation.
 */
export default function PultScreen() {
  const app = useApp();
  const s = useSessionState();
  const { width, height } = useWindowDimensions();
  const ff = formFactorOf(width);
  const [inspector, setInspector] = React.useState(false);
  const [view, setView] = React.useState<InstallationView>("main");
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

  const services = React.useMemo(
    () =>
      session
        ? bridgeServices(session.http, {
            httpBase: session.bridge ? httpBaseOf(session.bridge) : undefined,
            demo: session.kind === "demo",
          })
        : null,
    [session],
  );
  const pult = config?.pults.find((p) => p.id === app.pultId) ?? config?.pults[0];
  const store = pult ? session?.stores.get(pult.id) : undefined;
  const pultServices = React.useMemo(
    () => (services && pult ? { ...services, pult: pult.id } : null),
    [services, pult],
  );
  if (!session || !config || !pult || !store || !pultServices)
    return <View className="bg-background flex-1" />;

  const open = (panel: Panel) => {
    if (presentationOf(panel, ff) === "inspector") {
      setView("main");
      return setInspector((v) => !v);
    }
    router.push(panel === "settings" ? "/settings" : "/installation");
  };
  const connection =
    s.connection !== "open" ? "offline" : installationOnline(s) ? "online" : "connecting";
  const demo = session.kind === "demo";
  const previewH = Math.round(Math.min(220, Math.max(120, height * (ff === "phone" ? 0.2 : 0.24))));

  return (
    <ThemeProvider brand={config.theme}>
      <PultProvider store={store}>
        <ControlServicesProvider value={pultServices}>
          <SafeAreaView className="flex-1" edges={["top", "left", "right", "bottom"]}>
            <PultHeader
              name={config.installation.name}
              connection={connection}
              mode={session.controlMode()}
              onRequestControl={() => session.take()}
              onOpenSettings={() => open("settings")}
              onOpenInstallation={() => open("installation")}
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
          </SafeAreaView>
          {edgeTarget("left", ff) && <EdgeSwipe side="left" onOpen={() => open("settings")} />}
          <EdgeSwipe side="right" onOpen={() => open("installation")} />
          {ff === "tablet" && (
            <Inspector
              open={inspector}
              onClose={() => setInspector(false)}
              title={INSTALLATION_TITLE[view]}
            >
              <InstallationContent
                view={view}
                onView={setView}
                pultId={pult.id}
                onPult={app.setPultId}
                showBack
              />
            </Inspector>
          )}
        </ControlServicesProvider>
      </PultProvider>
    </ThemeProvider>
  );
}
