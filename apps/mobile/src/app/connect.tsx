import { parsePairing } from "@osc/protocol";
import { ThemeProvider } from "@osc/ui";
import { Button } from "@osc/ui/components/ui/button";
import { Text } from "@osc/ui/components/ui/text";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { demoConfig } from "@/lib/demo";
import { savePairing } from "@/lib/pairing";

/**
 * Deep link target: otakoyi-control://connect?bridge=ws://…/ws&pin=…&name=…
 * Opened by scanning the pairing QR with the phone camera. Saves the bridge and goes to the pult.
 */
export default function Connect() {
  const params = useLocalSearchParams();
  const pairing = React.useMemo(() => parsePairing(params as Record<string, unknown>), [params]);

  React.useEffect(() => {
    if (!pairing) return;
    savePairing(pairing).then(() => router.replace("/"));
  }, [pairing]);

  return (
    <ThemeProvider brand={demoConfig.theme}>
      <View className="bg-background flex-1 items-center justify-center gap-4 p-6">
        {pairing ? (
          <>
            <ActivityIndicator />
            <Text className="text-muted-foreground">
              Connecting to {pairing.name ?? "the installation"}…
            </Text>
          </>
        ) : (
          <>
            <Text className="text-foreground text-lg font-semibold">This link is not valid</Text>
            <Text className="text-muted-foreground text-center">
              Scan the QR code on the installation screen again, or ask the studio for a new one.
            </Text>
            <Button onPress={() => router.replace("/")}>
              <Text>Open the demo</Text>
            </Button>
          </>
        )}
      </View>
    </ThemeProvider>
  );
}
