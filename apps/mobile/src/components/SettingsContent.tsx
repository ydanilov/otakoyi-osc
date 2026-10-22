import {
  BellIcon,
  InfoIcon,
  LifebuoyIcon,
  LightningIcon,
  ListCard,
  ListRow,
  MonitorIcon,
  Note,
  QrCodeIcon,
  Section,
  SignOutIcon,
  SunIcon,
} from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import Constants from "expo-constants";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useApp, useSessionState } from "@/lib/app-context";
import { DebugContent } from "./DebugContent";
import { SheetTop } from "./SheetTop";

/**
 * Settings (ADR-013): pairing QR, control preferences, Developer › Debug, what's new, help, and forget this
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
  const [page, setPage] = React.useState<"whatsNew" | "help" | "debug" | null>(null);
  const version = Constants.expoConfig?.version ?? "";

  if (page === "debug")
    return (
      <View className="flex-1">
        <SheetTop title="Debug" onBack={() => setPage(null)} onClose={onClose} />
        <ScrollView contentContainerClassName="px-4 pb-10 pt-2">
          <DebugContent />
        </ScrollView>
      </View>
    );

  if (page)
    return (
      <View className="flex-1">
        <SheetTop
          title={page === "help" ? "Help" : "What's new"}
          onBack={() => setPage(null)}
          onClose={onClose}
        />
        <ScrollView contentContainerClassName="gap-3 px-5 pb-10 pt-2">
          {(page === "help" ? HELP : WHATS_NEW).map((p) => (
            <Text key={p} className="text-foreground text-md leading-6">
              {p}
            </Text>
          ))}
        </ScrollView>
      </View>
    );

  const address = session?.bridge?.replace(/^wss?:\/\//, "").replace(/\/ws$/, "");
  return (
    <View className="flex-1" testID="settings-panel">
      <SheetTop title="Settings" onClose={onClose} />
      <ScrollView contentContainerClassName="gap-6 px-4 pb-10 pt-2">
        <Section title={demo ? "Demo" : "This installation"}>
          <ListCard>
            <ListRow
              icon={MonitorIcon}
              title={s.config?.installation.name ?? session?.displayName ?? "—"}
              trailing="value"
              value={demo ? "Simulated" : address}
            />
            {!demo && <ListRow icon={QrCodeIcon} title="Show pairing QR" onPress={onShowPairing} />}
          </ListCard>
          <Note>
            {demo
              ? "A simulated installation inside the app. Nothing leaves this device."
              : "Another phone on the same Wi-Fi can scan the pairing QR to join."}
          </Note>
        </Section>

        <Section title="Controls">
          <ListCard>
            <ListRow
              icon={LightningIcon}
              title="Haptics"
              trailing="switch"
              checked={prefs.haptics}
              onCheckedChange={(v) => setPrefs({ haptics: v })}
            />
            <ListRow
              icon={SunIcon}
              title="Keep screen awake"
              trailing="switch"
              checked={prefs.keepAwake}
              onCheckedChange={(v) => setPrefs({ keepAwake: v })}
            />
          </ListCard>
          <Note>
            Two fingers on a fader or knob for fine control. Double-tap resets to the default.
          </Note>
        </Section>

        <Section title="Developer">
          <ListCard>
            <ListRow
              icon={InfoIcon}
              title="Debug"
              subtitle="Bridge, OSC log"
              onPress={() => setPage("debug")}
            />
          </ListCard>
        </Section>

        <ListCard>
          <ListRow icon={BellIcon} title="What's new" onPress={() => setPage("whatsNew")} />
          <ListRow icon={LifebuoyIcon} title="Help" onPress={() => setPage("help")} />
          <ListRow
            icon={InfoIcon}
            title="About this pult"
            subtitle="Designed by the studio. Ask them for changes."
            trailing="none"
          />
        </ListCard>

        <ListCard>
          <ListRow
            icon={SignOutIcon}
            title={demo ? "Exit demo" : "Forget this installation"}
            trailing="destructive"
            onPress={onLeave}
          />
        </ListCard>

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
