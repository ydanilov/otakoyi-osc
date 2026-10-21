import { pairingUrl, webPultUrl } from "@osc/protocol";
import { Button, Dialog as DialogContent, QrCodeIcon, ThemeProvider, WifiSlashIcon } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import { useLocalSearchParams } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { QrCode } from "@/components/QrCode";
import { useApp, useSessionState } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { closeSheet, resetTo } from "@/lib/navigation";

/**
 * Dialogs (ADR-013) are DS Dialog content in a sheet: medium detent on iPhone, a form sheet on
 * iPad — the system draws the grabber and the material. `kind=lost`: connection lost;
 * `kind=pairing`: this installation's pairing QR, for another device to scan.
 */
export default function Dialog() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const brand = useBrand();
  return (
    <ThemeProvider brand={brand.theme}>{kind === "pairing" ? <Pairing /> : <Lost />}</ThemeProvider>
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
    <View className="flex-1" testID="dialog-lost">
      <DialogContent
        icon={WifiSlashIcon}
        title="Connection lost"
        description={`Reconnecting to ${name}… Check that this device is on the installation's Wi-Fi.`}
        actions={
          <>
            <Button
              label="Forget"
              variant="secondary"
              className="flex-1"
              onPress={() => {
                void app.leave();
                resetTo("/connect");
              }}
            />
            <Button
              label="OK"
              className="flex-1"
              onPress={() => {
                app.session?.dismissLost();
                closeSheet();
              }}
            />
          </>
        }
      />
    </View>
  );
}

function Pairing() {
  const app = useApp();
  const s = useSessionState();
  const session = app.session;
  if (!session?.bridge)
    return <DialogContent title="No pairing QR" description="The demo runs on this device only." />;
  const p = { bridge: session.bridge, pin: session.pin, name: s.config?.installation.name };
  return (
    <View className="flex-1" testID="dialog-pairing">
      <DialogContent
        icon={QrCodeIcon}
        title="Pair another device"
        description="Scan with Otakoyi Control or the phone's camera, on the installation's Wi-Fi."
        actions={<Button label="Done" className="flex-1" onPress={closeSheet} />}
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
