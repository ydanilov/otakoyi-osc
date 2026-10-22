import { parsePairing } from "@osc/protocol";
import { Button, InfoCard, Note, ThemeProvider, Viewfinder } from "@osc/ui";
import { router } from "expo-router";
import * as React from "react";
import { View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetTop } from "@/components/SheetTop";
import { useApp } from "@/lib/app-context";
import { formFactorOf } from "@/lib/nav";
import { closeSheet } from "@/lib/navigation";
import { scanner } from "@/lib/platform/scanner";

/**
 * In-app scanner for the pairing QR (behind the `Scanner` interface: the camera on iOS, a stub on
 * web), framed by the DS Viewfinder. A pairing link connects and goes to the loading screen.
 */
export default function Scan() {
  const app = useApp();
  const { width } = useWindowDimensions();
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
  const Camera = scanner.View;
  return (
    <ThemeProvider>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <SheetTop title="Scan pairing QR" onClose={closeSheet} />
        {Camera ? (
          <View className="flex-1 items-center justify-center gap-6 px-6">
            <Viewfinder size={formFactorOf(width)}>
              <Camera onScan={onScan} />
            </Viewfinder>
            <Note>{hint ?? "Point the camera at the QR on the installation's screen."}</Note>
          </View>
        ) : (
          <View className="flex-1 justify-center gap-5 px-6" testID="scan-unavailable">
            <InfoCard>{scanner.unavailableReason ?? "Scanning isn't available here."}</InfoCard>
            <Button
              label="Enter address and PIN"
              onPress={() => {
                closeSheet();
                router.push("/manual");
              }}
              block
            />
          </View>
        )}
      </SafeAreaView>
    </ThemeProvider>
  );
}
