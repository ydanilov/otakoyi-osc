import { parsePairing } from "@osc/protocol";
import { ConnectOptions, InfoCard, ThemeProvider, WarningIcon } from "@osc/ui";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/lib/app-context";

/**
 * First run (ADR-012, no client login): the DS Connect Options — scan the pairing QR, enter the
 * address and PIN, or try the demo. Also the deep link target —
 * `otakoyi-control://connect?bridge=…&pin=…&name=…` (the pairing QR, opened by the phone's
 * camera) goes straight to the loading screen.
 */
export default function Connect() {
  const app = useApp();
  const params = useLocalSearchParams();
  const hasLink = typeof params.bridge === "string";
  const pairing = React.useMemo(
    () => (hasLink ? parsePairing(params as Record<string, unknown>) : null),
    [hasLink, params],
  );
  const starting = React.useRef(false);

  React.useEffect(() => {
    if (!pairing) return;
    void app.connect(pairing).then(() => router.replace("/loading"));
  }, [pairing]); // eslint-disable-line react-hooks/exhaustive-deps

  const demo = async () => {
    if (starting.current) return;
    starting.current = true;
    await app.startDemo();
    router.replace("/loading");
  };

  return (
    <ThemeProvider>
      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        <View className="w-full max-w-md flex-1 self-center">
          {hasLink && !pairing && (
            <View className="px-6 pt-6" testID="bad-link">
              <InfoCard icon={WarningIcon}>
                This pairing link is not valid. Scan the QR on the installation screen again, or ask
                the studio for a new one.
              </InfoCard>
            </View>
          )}
          <ConnectOptions
            onScan={() => router.push("/scan")}
            onEnterAddress={() => router.push("/manual")}
            onDemo={() => void demo()}
          />
        </View>
      </SafeAreaView>
    </ThemeProvider>
  );
}
