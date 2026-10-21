import { pairingUrl, webPultUrl } from "@osc/protocol";
import { ThemeProvider } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import { useLocalSearchParams } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { DialogContent } from "@/components/ds/DialogContent";
import { SheetHeader } from "@/components/ds/Sheet";
import { QrCode } from "@/components/QrCode";
import { useApp, useSessionState } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { closeSheet, resetTo } from "@/lib/navigation";

/**
 * Dialogs (ADR-013) are content in a sheet: medium detent on iPhone, a form sheet on iPad — the
 * system draws the grabber and the material. `kind=lost`: connection lost; `kind=pairing`: this
 * installation's pairing QR, for another device to scan.
 */
export default function Dialog() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const brand = useBrand();
  return (
    <ThemeProvider brand={brand.theme}>
      <SheetHeader title="" onClose={closeSheet} />
      {kind === "pairing" ? <Pairing /> : <Lost />}
    </ThemeProvider>
  );
}

function Lost() {
  const app = useApp();
  const s = useSessionState();
  const name = s.config?.installation.name ?? app.session?.displayName ?? "the installation";
  // Back online: the dialog closes itself.
  React.useEffect(() => {
    if (s.connection === "open" && !s.lost) closeSheet();
  }, [s.connection, s.lost]);
  return (
    <View testID="dialog-lost">
      <DialogContent
        title="Connection lost"
        message={`Reconnecting to ${name}… Check that this device is on the installation's Wi-Fi. The pult works again as soon as it's back.`}
        cancel={{
          label: "Forget",
          onPress: () => {
            void app.leave();
            resetTo("/connect");
          },
        }}
        action={{
          label: "OK",
          onPress: () => {
            app.session?.dismissLost();
            closeSheet();
          },
        }}
      />
    </View>
  );
}

function Pairing() {
  const app = useApp();
  const s = useSessionState();
  const session = app.session;
  if (!session?.bridge)
    return <DialogContent title="No pairing QR" message="The demo runs on this device only." />;
  const p = { bridge: session.bridge, pin: session.pin, name: s.config?.installation.name };
  return (
    <View testID="dialog-pairing">
      <DialogContent
        title="Pair another device"
        message="Scan with the Otakoyi Control app or the phone's camera, on the installation's Wi-Fi."
        action={{ label: "Done", onPress: closeSheet }}
      >
        <View className="items-center gap-3 py-2">
          <QrCode value={pairingUrl(p)} size={200} />
          <Text className="text-muted-foreground text-center font-mono text-xs" selectable>
            {webPultUrl({ bridge: p.bridge })}
            {p.pin ? `  ·  PIN ${p.pin}` : ""}
          </Text>
        </View>
      </DialogContent>
    </View>
  );
}
