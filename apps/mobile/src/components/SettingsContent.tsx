import { Switch } from "@osc/ui/components/ui/switch";
import { Text } from "@osc/ui/components/ui/text";
import Constants from "expo-constants";
import { BookOpen, LifeBuoy, LogOut, QrCode, Sparkles, Vibrate, Sun } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useApp, useSessionState } from "@/lib/app-context";
import { ListRow, ListSection } from "./ds/ListRow";
import { SheetHeader } from "./ds/Sheet";

/**
 * Settings (ADR-013): pairing QR, control preferences, what's new, help, and forget this
 * installation (or exit the demo). No appearance switch: the theme mode ships in the config
 * (ADR-004), and there is no way to change the brand here.
 */
export function SettingsContent({
  onClose,
  onShowPairing,
  onLeave,
}: {
  onClose: () => void;
  onShowPairing: () => void;
  onLeave: () => void;
}) {
  const { session, prefs, setPrefs } = useApp();
  const s = useSessionState();
  const demo = session?.kind === "demo";
  const [about, setAbout] = React.useState<"whatsNew" | "help" | null>(null);
  const version = Constants.expoConfig?.version ?? "";

  if (about)
    return (
      <View className="flex-1">
        <SheetHeader
          title={about === "help" ? "Help" : "What's new"}
          onBack={() => setAbout(null)}
        />
        <ScrollView contentContainerClassName="gap-3 px-5 pb-10 pt-2">
          {(about === "help" ? HELP : WHATS_NEW).map((p) => (
            <Text key={p} className="text-foreground text-[15px] leading-6">
              {p}
            </Text>
          ))}
        </ScrollView>
      </View>
    );

  return (
    <View className="flex-1" testID="settings-panel">
      <SheetHeader title="Settings" onClose={onClose} />
      <ScrollView contentContainerClassName="gap-6 px-4 pb-10 pt-2">
        <ListSection
          title={demo ? "Demo" : "This installation"}
          footer={
            demo
              ? "A simulated installation inside the app. Nothing leaves this device."
              : "Another phone on the same Wi-Fi can scan this code to join."
          }
        >
          <ListRow
            title={s.config?.installation.name ?? session?.displayName ?? "—"}
            detail={
              demo
                ? "Simulated installation"
                : session?.bridge?.replace(/^wss?:\/\//, "").replace(/\/ws$/, "")
            }
          />
          {!demo && (
            <ListRow
              title="Show pairing QR"
              icon={QrCode}
              chevron
              onPress={onShowPairing}
              testID="settings-pairing"
            />
          )}
        </ListSection>

        <ListSection
          title="Controls"
          footer="Two fingers on a fader or knob for fine control. Double-tap resets to the default."
        >
          <ListRow
            title="Haptics"
            icon={Vibrate}
            accessory={
              <Switch
                checked={prefs.haptics}
                onCheckedChange={(v) => setPrefs({ haptics: v })}
                accessibilityLabel="Haptics"
              />
            }
          />
          <ListRow
            title="Keep screen awake"
            icon={Sun}
            accessory={
              <Switch
                checked={prefs.keepAwake}
                onCheckedChange={(v) => setPrefs({ keepAwake: v })}
                accessibilityLabel="Keep screen awake"
              />
            }
          />
        </ListSection>

        <ListSection>
          <ListRow
            title="What's new"
            icon={Sparkles}
            chevron
            onPress={() => setAbout("whatsNew")}
          />
          <ListRow title="Help" icon={LifeBuoy} chevron onPress={() => setAbout("help")} />
          <ListRow
            title="About pults"
            icon={BookOpen}
            detail="Your pult is designed by the studio. Ask them for changes."
          />
        </ListSection>

        <ListSection>
          <ListRow
            title={demo ? "Exit demo" : "Forget this installation"}
            icon={LogOut}
            destructive
            onPress={onLeave}
            testID="settings-leave"
          />
        </ListSection>

        <Text className="text-muted-foreground text-center text-xs">Otakoyi Control {version}</Text>
      </ScrollView>
    </View>
  );
}

const WHATS_NEW = [
  "No accounts: join an installation by scanning its pairing QR, or enter its address and PIN.",
  "Try the demo: a simulated installation with a live preview, right in the app.",
  "Installation panel: status, FPS, devices and uptime, quick actions and the activity feed.",
  "Prompts: long-press a card for its menu; deleting can be undone; drag to reorder.",
];

const HELP = [
  "Pairing: on the installation computer, press Ctrl+Shift+P. The pairing QR shows on the installation's screen for 2 minutes. Scan it with this app or with the phone's camera.",
  "No camera? Enter the address and the 4-digit PIN printed under the QR.",
  "This device must be on the installation's Wi-Fi. Changing the installation's PIN disconnects every paired device.",
  "View only: another device is in control. Tap Take control in the header.",
];
