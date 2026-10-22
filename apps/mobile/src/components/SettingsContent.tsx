import {
  BellIcon,
  ClockCounterClockwiseIcon,
  DeviceMobileIcon,
  DrawerHeader,
  GearSixIcon,
  InfoIcon,
  LifebuoyIcon,
  ListCard,
  ListRow,
  QrCodeIcon,
  ScanIcon,
  Section,
  VibrateIcon,
} from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import Constants from "expo-constants";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useApp } from "@/lib/app-context";
import { DebugContent } from "./DebugContent";
import { SheetTop } from "./SheetTop";

/**
 * Settings (ADR-013; Figma Demo › Phone / 04 Settings, Tablet / 04 Settings): inset-grouped sections
 * — Pairing (show the pairing QR on the installation, pair another installation), Control
 * preferences (haptics, keep screen awake, status notifications), Developer › Debug, About (what's
 * new, help & support, app version) and Account (forget this installation, or exit the demo).
 * No appearance switch: the theme mode ships in the config (ADR-004).
 * `variant`: `sheet` (iPhone system sheet: Close × leading, centred title) or `drawer` (iPad left
 * drawer: large title and a round close button).
 */
export function SettingsContent({
  onClose,
  onShowPairing,
  onLeave,
  variant = "sheet",
}: {
  onClose: () => void;
  onShowPairing: () => void;
  onLeave: () => void;
  variant?: "sheet" | "drawer";
}) {
  const { session, prefs, setPrefs } = useApp();
  const demo = session?.kind === "demo";
  const [page, setPage] = React.useState<"whatsNew" | "help" | "debug" | null>(null);
  const version = Constants.expoConfig?.version ?? "";
  const build = Constants.expoConfig?.ios?.buildNumber ?? "1";
  const Top = ({ title, onBack }: { title: string; onBack?: () => void }) =>
    variant === "drawer" ? (
      <DrawerHeader title={title} onBack={onBack} onClose={onClose} />
    ) : (
      <SheetTop title={title} onBack={onBack} onClose={onClose} />
    );

  if (page === "debug")
    return (
      <View className="flex-1">
        <Top title="Debug" onBack={() => setPage(null)} />
        <ScrollView contentContainerClassName="px-4 pb-10 pt-2">
          <DebugContent />
        </ScrollView>
      </View>
    );

  if (page)
    return (
      <View className="flex-1">
        <Top
          title={page === "help" ? "Help & support" : "What's new"}
          onBack={() => setPage(null)}
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

  return (
    <View className="flex-1" testID="settings-panel">
      <Top title="Settings" />
      <ScrollView contentContainerClassName="gap-6 px-4 pb-10 pt-3">
        <Section title="Pairing">
          <ListCard>
            <ListRow
              icon={QrCodeIcon}
              title="Show pairing QR on installation"
              onPress={onShowPairing}
              disabled={demo}
            />
            <ListRow icon={ScanIcon} title="Pair another installation" onPress={onLeave} />
          </ListCard>
        </Section>

        <Section title="Control preferences">
          <ListCard>
            <ListRow
              icon={VibrateIcon}
              title="Haptics"
              trailing="switch"
              checked={prefs.haptics}
              onCheckedChange={(v) => setPrefs({ haptics: v })}
            />
            <ListRow
              icon={DeviceMobileIcon}
              title="Keep screen awake"
              trailing="switch"
              checked={prefs.keepAwake}
              onCheckedChange={(v) => setPrefs({ keepAwake: v })}
            />
            <ListRow
              icon={BellIcon}
              title="Status notifications"
              trailing="switch"
              checked={prefs.notifications}
              onCheckedChange={(v) => setPrefs({ notifications: v })}
            />
          </ListCard>
        </Section>

        <Section title="Developer">
          <ListCard>
            <ListRow
              icon={InfoIcon}
              title="Debug"
              value="Bridge, OSC log"
              onPress={() => setPage("debug")}
            />
          </ListCard>
        </Section>

        <Section title="About">
          <ListCard>
            <ListRow
              icon={ClockCounterClockwiseIcon}
              title="What's new"
              value={`v${version}`}
              onPress={() => setPage("whatsNew")}
            />
            <ListRow icon={LifebuoyIcon} title="Help & support" onPress={() => setPage("help")} />
            <ListRow
              icon={InfoIcon}
              title="App version"
              trailing="value"
              value={`${version} (${build})`}
            />
          </ListCard>
        </Section>

        <Section title="Account">
          <ListCard>
            <ListRow
              icon={GearSixIcon}
              title={demo ? "Exit demo" : "Forget this installation"}
              trailing="destructive"
              onPress={onLeave}
            />
          </ListCard>
        </Section>
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
