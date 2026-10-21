import { CameraView, useCameraPermissions } from "expo-camera";
import { Button } from "@osc/ui/components/ui/button";
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { View } from "react-native";
import type { Scanner } from "./scanner.types";

export type { Scanner } from "./scanner.types";

/** Native scanner: the back camera, QR codes only. Needs a development build (expo-camera). */
function CameraScanner({ onScan, paused }: { onScan: (data: string) => void; paused?: boolean }) {
  const [permission, request] = useCameraPermissions();
  if (!permission) return <View className="bg-background flex-1" />;
  if (!permission.granted)
    return (
      <View className="bg-background flex-1 items-center justify-center gap-4 p-8">
        <Text className="text-foreground text-center">
          Allow the camera to scan the pairing QR on the installation screen.
        </Text>
        <Button onPress={() => void request()}>
          <Text>Allow camera</Text>
        </Button>
      </View>
    );
  return (
    <CameraView
      style={{ flex: 1 }}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={paused ? undefined : (r) => onScan(r.data)}
    />
  );
}

export const scanner: Scanner = { available: true, View: CameraScanner };
