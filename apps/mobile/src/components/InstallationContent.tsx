import type { BridgeHealth } from "@osc/protocol";
import { Icon } from "@osc/ui/components/ui/icon";
import { Switch } from "@osc/ui/components/ui/switch";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { Activity, Check } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useApp, useSessionState } from "@/lib/app-context";
import {
  actionMessage,
  activityLine,
  installationState,
  installationStats,
  modeToggles,
  quickActions,
} from "@/lib/installation";
import { installationOnline } from "@/lib/session";
import { ListRow, ListSection } from "./ds/ListRow";
import { SheetHeader } from "./ds/Sheet";
import { QuickActionButton } from "./QuickActionButton";

/** How often the stats refresh while the panel is open. */
const HEALTH_MS = 2000;

const STATE_DOT = {
  online: "bg-status-online",
  offline: "bg-status-offline",
  blackout: "bg-status-critical",
  paused: "bg-status-warning",
  idle: "bg-status-warning",
} as const;

/**
 * Installation panel (ADR-013): name and status with stats, pult switcher, quick actions
 * (Flash, Restart and Blackout with hold-to-confirm), modes (Idle, optional Pause) and an Activity
 * row that pushes the activity list. The same content is the iPhone sheet and the iPad inspector.
 */
export function InstallationContent({
  pultId,
  onPult,
  onClose,
}: {
  pultId: string | null;
  onPult: (id: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = React.useState<"main" | "activity">("main");
  if (view === "activity") return <ActivityView onBack={() => setView("main")} onClose={onClose} />;
  return (
    <MainView
      pultId={pultId}
      onPult={onPult}
      onClose={onClose}
      onActivity={() => setView("activity")}
    />
  );
}

function MainView({
  pultId,
  onPult,
  onClose,
  onActivity,
}: {
  pultId: string | null;
  onPult: (id: string) => void;
  onClose: () => void;
  onActivity: () => void;
}) {
  const { session, prefs } = useApp();
  const s = useSessionState();
  const [health, setHealth] = React.useState<BridgeHealth | null>(null);
  React.useEffect(() => {
    if (!session) return;
    let alive = true;
    const load = () =>
      session.http.health().then(
        (h) => alive && setHealth(h),
        () => {},
      );
    void load();
    const t = setInterval(load, HEALTH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [session]);

  const online = installationOnline(s);
  const state = installationState({ online, modes: s.modes });
  const stats = installationStats(health, { online, modes: s.modes });
  const canControl = session?.controlMode() === "control";
  const actions = quickActions(s.actions);
  const modes = modeToggles(s.actions);
  const last = s.activity.at(-1);
  const lastLine = last ? activityLine(last, s.config, session?.device) : null;
  const pults = s.config?.pults ?? [];

  return (
    <View className="flex-1" testID="installation-panel">
      <SheetHeader title="Installation" onClose={onClose} />
      <ScrollView contentContainerClassName="gap-6 px-4 pb-10 pt-2">
        <View className="gap-3">
          <View className="flex-row items-center gap-2.5">
            <View className={cn("h-2.5 w-2.5 rounded-full", STATE_DOT[state.name])} />
            <Text className="text-foreground flex-1 text-xl font-semibold" numberOfLines={1}>
              {s.config?.installation.name ?? session?.displayName}
            </Text>
            <Text className="text-muted-foreground text-sm">{state.label}</Text>
          </View>
          <View className="flex-row gap-2">
            {stats.map((st) => (
              <View
                key={st.key}
                className="bg-muted flex-1 gap-0.5 rounded-lg px-2.5 py-2"
                accessible
                accessibilityLabel={`${st.label}: ${st.value}`}
              >
                <Text className="text-muted-foreground text-[11px] uppercase tracking-wider">
                  {st.label}
                </Text>
                <Text className="text-foreground font-mono text-[15px]" numberOfLines={1}>
                  {st.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {pults.length > 1 && (
          <ListSection title="Pult">
            {pults.map((p) => (
              <ListRow
                key={p.id}
                title={p.name}
                onPress={() => onPult(p.id)}
                accessory={
                  p.id === pultId ? (
                    <Icon as={Check} size={18} className="text-brand-accent" />
                  ) : null
                }
                testID={`pult-${p.id}`}
              />
            ))}
          </ListSection>
        )}

        {actions.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-muted-foreground px-4 text-xs font-medium uppercase tracking-wider">
              Quick actions
            </Text>
            <View className="flex-row gap-2">
              {actions.map((a) => (
                <QuickActionButton
                  key={a.name}
                  label={a.label}
                  hold={a.hold}
                  on={a.latched ? s.modes.blackout : undefined}
                  disabled={!canControl}
                  haptics={prefs.haptics}
                  onTrigger={() => {
                    const m = actionMessage(a, s.modes);
                    session?.action(m.name, m.on);
                  }}
                />
              ))}
            </View>
            {!canControl && (
              <Text className="text-muted-foreground px-4 text-xs">
                Take control to use the quick actions.
              </Text>
            )}
          </View>
        )}

        {modes.length > 0 && (
          <ListSection
            title="Modes"
            footer="Idle keeps the ambient loop and stops reacting to people."
          >
            {modes.map((m) => (
              <ListRow
                key={m.name}
                title={m.label}
                disabled={!canControl}
                accessory={
                  <Switch
                    checked={s.modes[m.name]}
                    disabled={!canControl}
                    onCheckedChange={(on) => session?.setMode(m.name, on)}
                    accessibilityLabel={m.label}
                    testID={`mode-${m.name}`}
                  />
                }
              />
            ))}
          </ListSection>
        )}

        <ListSection>
          <ListRow
            title="Activity"
            icon={Activity}
            detail={lastLine ? `${lastLine.title} · ${lastLine.time}` : "Nothing yet"}
            chevron
            onPress={onActivity}
            testID="activity-row"
          />
        </ListSection>
      </ScrollView>
    </View>
  );
}

/** The bridge's activity feed, newest first (pushed from the Installation panel). */
function ActivityView({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { session } = useApp();
  const s = useSessionState();
  const lines = [...s.activity].reverse();
  return (
    <View className="flex-1" testID="activity-list">
      <SheetHeader
        title="Activity"
        onBack={onBack}
        trailing={
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="min-h-touch justify-center px-1"
          >
            <Text className="text-brand-accent text-[15px] font-semibold">Done</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-2">
        {lines.length === 0 ? (
          <Text className="text-muted-foreground py-10 text-center">No activity yet.</Text>
        ) : (
          <ListSection footer={`The last ${lines.length} events on this installation.`}>
            {lines.map((e, i) => {
              const l = activityLine(e, s.config, session?.device);
              return (
                <ListRow
                  key={`${e.ts}-${i}`}
                  title={l.title}
                  detail={l.detail || undefined}
                  value={l.time}
                />
              );
            })}
          </ListSection>
        )}
      </ScrollView>
    </View>
  );
}
