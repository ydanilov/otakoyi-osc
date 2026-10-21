import { parsePairing } from "@osc/protocol";
import { ThemeProvider } from "@osc/ui";
import { Button } from "@osc/ui/components/ui/button";
import { Text } from "@osc/ui/components/ui/text";
import { router } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/ds/Sheet";
import { useApp } from "@/lib/app-context";
import { closeSheet } from "@/lib/navigation";
import { scanner } from "@/lib/platform/scanner";

/**
 * In-app scanner for the pairing QR (behind the `Scanner` interface: the camera on iOS, a stub on
 * web). A pairing link connects and goes to the loading screen; anything else is ignored with a hint.
 */
export default function Scan() {
  const app = useApp();
  const [hint, setHint] = React.useState<string | null>(null);
  const busy = React.useRef(false);
  const onScan = async (data: string) => {
    if (busy.current) return;
    const p = parsePairing(data);
    if (!p) return setHint("That's not an Otakoyi pairing code. Scan the QR on the installation.");
    busy.current = true;
    await app.connect(p);
    closeSheet();
    router.replace("/loading");
  };
  const View_ = scanner.View;
  return (
    <ThemeProvider>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <SheetHeader title="Scan pairing QR" onClose={closeSheet} />
        {View_ ? (
          <View className="flex-1">
            <View_ onScan={onScan} />
            <View className="absolute bottom-8 left-6 right-6 bg-background/80 rounded-xl p-3">
              <Text className="text-foreground text-center text-sm">
                {hint ?? "Point the camera at the QR on the installation's screen."}
              </Text>
            </View>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center gap-5 px-8" testID="scan-unavailable">
            <Text className="text-muted-foreground text-center text-[15px] leading-6">
              {scanner.unavailableReason}
            </Text>
            <Button
              onPress={() => {
                closeSheet();
                router.push("/manual");
              }}
            >
              <Text>Enter address and PIN</Text>
            </Button>
          </View>
        )}
      </SafeAreaView>
    </ThemeProvider>
  );
}
