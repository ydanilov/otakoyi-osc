import { ThemeProvider, useTheme } from "@osc/ui";
import { Button } from "@osc/ui/components/ui/button";
import { Text } from "@osc/ui/components/ui/text";
import { router } from "expo-router";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Backdrop } from "@/components/ds/Backdrop";
import { ClientLogo } from "@/components/ds/ClientLogo";
import { useApp, useSessionState } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { loadingPhase, nextLoadingTick, type LoadingAction } from "@/lib/loading";

/**
 * Client-branded loading screen (ADR-012, ADR-013): the client's full-screen image
 * (`theme.splash`) with a legibility gradient, their logo, "Connecting to …" and a small
 * "Powered by otakoyi". Shown while the bridge handshake runs (at least ~600 ms, no maximum).
 * Problems appear inline here (Retry / Enter address), never as an alert.
 */
export default function Loading() {
  const app = useApp();
  const brand = useBrand();
  const s = useSessionState();
  const [now, setNow] = React.useState(Date.now());
  // The minimum time counts from when this screen is on screen (or from a retry).
  const [shownAt] = React.useState(Date.now());
  const startedAt = Math.max(app.startedAt, shownAt);
  const name = brand.name || app.session?.displayName || "the installation";
  const phase = loadingPhase({
    state: s,
    startedAt,
    now,
    name,
    demo: app.session?.kind === "demo",
  });

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
      const address = app.session?.bridge?.replace(/^wss?:\/\//, "").replace(/\/ws$/, "");
      router.push({ pathname: "/manual", params: address ? { address } : {} });
    }
  };

  return (
    <ThemeProvider brand={brand.theme}>
      <Backdrop source={brand.splash} />
      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        <View className="flex-1 items-center justify-center px-8" testID="loading-screen">
          <View className="flex-1 justify-center">
            <ClientLogo source={brand.logo} name={name} />
          </View>
          <View className="min-h-40 w-full max-w-sm items-center justify-start gap-4">
            {phase.phase === "error" ? (
              <View
                className="bg-card/90 border-border w-full gap-3 rounded-2xl border p-5"
                accessibilityLiveRegion="polite"
                testID="loading-error"
              >
                <Text className="text-foreground text-lg font-semibold">{phase.title}</Text>
                <Text className="text-muted-foreground text-[15px] leading-5">{phase.message}</Text>
                <View className="flex-row gap-3 pt-1">
                  {phase.actions
                    .filter((a) => a !== "update")
                    .map((a, i) => (
                      <Button
                        key={a}
                        className="flex-1"
                        variant={i === 0 ? "default" : "secondary"}
                        onPress={() => act(a)}
                      >
                        <Text>{a === "retry" ? "Retry" : "Enter address"}</Text>
                      </Button>
                    ))}
                </View>
              </View>
            ) : (
              <Loader name={name} />
            )}
          </View>
          <Text className="text-foreground/60 pb-2 text-[11px] tracking-wider">
            Powered by <Text className="text-foreground/80 text-[11px] font-semibold">otakoyi</Text>
          </Text>
        </View>
      </SafeAreaView>
    </ThemeProvider>
  );
}

function Loader({ name }: { name: string }) {
  const t = useTheme();
  return (
    <View className="items-center gap-3" accessibilityLiveRegion="polite">
      <ActivityIndicator color={t.color.text} />
      <Text className="text-foreground text-[15px]" testID="loading-text">
        Connecting to {name}…
      </Text>
    </View>
  );
}
