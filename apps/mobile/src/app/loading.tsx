import {
  Backdrop,
  Button,
  ClientLogo,
  InfoCard,
  Loader,
  ThemeProvider,
  WarningIcon,
  WifiSlashIcon,
} from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import { router } from "expo-router";
import * as React from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, useSessionState } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { formFactorOf } from "@/lib/nav";
import { loadingPhase, nextLoadingTick, type LoadingAction } from "@/lib/loading";

/**
 * Client-branded loading screen (ADR-012, ADR-013; Figma Demo › 02 Loading), from DS parts: the
 * client's full-screen image (`theme.splash`, DS Backdrop with its legibility gradient), their logo
 * (DS Client Logo) and the DS Loader "Connecting to …" centred together. The demo shows
 * "OTAKOYI · Demo · Simulated installation" and "Starting the demo…". Shown while the bridge handshake runs
 * (at least ~600 ms, no maximum). Problems appear inline here (Retry / Enter address), never as an
 * alert.
 */
export default function Loading() {
  const app = useApp();
  const brand = useBrand();
  const s = useSessionState();
  const insets = useSafeAreaInsets();
  const tablet = formFactorOf(useWindowDimensions().width) === "tablet";
  const [now, setNow] = React.useState(Date.now());
  // The minimum time counts from when this screen is on screen (or from a retry).
  const [shownAt] = React.useState(Date.now());
  const startedAt = Math.max(app.startedAt, shownAt);
  // Before the bridge answers a new pairing, its name is unknown: show its address instead.
  const host = app.session?.bridge?.replace(/^wss?:\/\//, "").replace(/\/ws$/, "");
  const name = brand.name || "The installation";
  const logoName = brand.name || host || "Otakoyi";
  const demo = app.session?.kind === "demo";
  const phase = loadingPhase({ state: s, startedAt, now, name, demo });

  // Re-evaluate when the minimum time or the "unreachable" timeout passes.
  React.useEffect(() => {
    const wait = nextLoadingTick(startedAt, Date.now());
    if (wait === null) return;
    const t = setTimeout(() => setNow(Date.now()), wait + 10);
    return () => clearTimeout(t);
  }, [startedAt, now, s]);

  React.useEffect(() => {
    if (!app.session) router.replace("/connect");
    else if (phase.phase === "ready") router.replace("/pult");
  }, [phase.phase, app.session]);

  const act = (a: LoadingAction) => {
    if (a === "retry") {
      app.retry();
      setNow(Date.now());
    } else if (a === "address") {
      const address = host;
      router.push({ pathname: "/manual", params: address ? { address } : {} });
    }
  };

  return (
    <ThemeProvider brand={brand.theme}>
      <Backdrop source={brand.splash ?? undefined}>
        <View
          className="flex-1 items-center justify-center gap-7 px-6"
          // Figma 02 Loading: the logo + loader block sits 6 pt below the centre of the safe area.
          style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom }}
          testID="loading-screen"
        >
          {demo ? (
            // Figma Demo › 02 Loading: the studio's name over the simulated installation.
            <ClientLogo
              name="Otakoyi"
              subtitle="Demo · Simulated installation"
              size={tablet ? "xl" : "lg"}
            />
          ) : (
            <ClientLogo
              name={logoName}
              source={brand.logo ?? undefined}
              size={brand.name ? (tablet ? "xl" : "lg") : "sm"}
            />
          )}
          <View className="w-full max-w-sm items-center gap-6">
            {phase.phase === "error" ? (
              <View className="gap-3 self-stretch" testID="loading-error">
                <Text className="text-foreground text-lg font-semibold">{phase.title}</Text>
                <InfoCard icon={phase.title === "Wrong PIN" ? WarningIcon : WifiSlashIcon}>
                  {phase.message}
                </InfoCard>
                <View className="flex-row gap-3">
                  {phase.actions
                    .filter((a) => a !== "update")
                    .map((a, i) => (
                      <Button
                        key={a}
                        label={a === "retry" ? "Retry" : "Enter address"}
                        variant={i === 0 ? "primary" : "secondary"}
                        onPress={() => act(a)}
                        className="flex-1"
                      />
                    ))}
                </View>
              </View>
            ) : (
              <Loader
                label={
                  demo
                    ? "Starting the demo…"
                    : brand.name
                      ? `Connecting to ${brand.name}…`
                      : "Connecting…"
                }
              />
            )}
          </View>
        </View>
      </Backdrop>
    </ThemeProvider>
  );
}
