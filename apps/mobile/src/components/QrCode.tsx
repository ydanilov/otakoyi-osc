import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import QRCode from "qrcode";
import * as React from "react";
import { View } from "react-native";

/** A QR code drawn with Skia (dark modules on a white quiet zone, so any camera reads it). */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const path = React.useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const margin = 2;
    const cell = size / (n + margin * 2);
    const b = Skia.PathBuilder.Make();
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (qr.modules.get(y, x))
          b.addRect(
            Skia.XYWHRect((x + margin) * cell, (y + margin) * cell, cell + 0.4, cell + 0.4),
          );
    return b.build();
  }, [value, size]);
  return (
    <View
      style={{ width: size, height: size }}
      className="overflow-hidden rounded-lg bg-white"
      accessibilityRole="image"
      accessibilityLabel="Pairing QR code"
      testID="pairing-qr"
    >
      <Canvas style={{ width: size, height: size }}>
        <Path path={path} color="#000000" />
      </Canvas>
    </View>
  );
}
