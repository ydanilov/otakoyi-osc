import type { ActivityEntry, BridgeHealth } from "@osc/protocol";
import {
  ActivityRow,
  ArrowClockwiseIcon,
  Button,
  CaretLeftIcon,
  ClockCounterClockwiseIcon,
  ConnectionStatus,
  FlashlightIcon,
  HandPalmIcon,
  InfoIcon,
  ListCard,
  ListRow,
  MonitorIcon,
  Note,
  PauseIcon,
  PowerIcon,
  InstallationActions,
  Section,
  iconByName,
  StatTile,
  type ActivityKind,
  type QuickActionItem,
} from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { View } from "react-native";
import { useApp, useSessionState } from "@/lib/app-context";
import { DebugContent } from "./DebugContent";
import {
  actionMessage,
  activityLine,
  installationState,
  installationStats,
  modeToggles,
  quickActions,
} from "@/lib/installation";
import { installationOnline } from "@/lib/session";
import { pultRows } from "@/lib/nav";

/** How often the stats refresh while the panel is open. */
const HEALTH_MS = 2000;
/** Hold-to-confirm for Restart and Blackout (ADR-016). */
const HOLD_MS = 1200;

export type InstallationView = "main" | "activity" | "debug";

/** Title of the inspector / sheet for a view. */
export const INSTALLATION_TITLE: Record<InstallationView, string> = {
  main: "Installation",
  activity: "Activity",
  debug: "Debug",
};

const ACTION_ICON = { flash: FlashlightIcon, restart: ArrowClockwiseIcon, blackout: PowerIcon };

/**
 * Installation panel body (ADR-013): name and status with stats, pult switcher, quick actions
 * (Flash, Restart and Blackout with hold-to-confirm), modes (Idle, optional Pause), an Activity
 * row that pushes the activity list and a Debug row that pushes the Debug page. Built from DS parts; the route (iPhone sheet) or the DS
 * Inspector (iPad) provides the frame.
 */
export function InstallationContent({
  view,
  onView,
  pultId,
  onPult,
  showBack,
}: {
  view: InstallationView;
  onView: (v: InstallationView) => void;
  pultId: string | null;
  onPult: (id: string) => void;
  /** The inspector has no back button of its own: show one in the pushed Activity / Debug view. */
  showBack?: boolean;
}) {
  const back = showBack ? () => onView("main") : undefined;
  if (view === "activity") return <ActivityList onBack={back} />;
  if (view === "debug") return <DebugContent onBack={back} backLabel="Installation" />;
  return (
    <Main
      pultId={pultId}
      onPult={onPult}
      onActivity={() => onView("activity")}
      onDebug={() => onView("debug")}
    />
  );
}

function Main({
  pultId,
  onPult,
  onActivity,
  onDebug,
}: {
  pultId: string | null;
  onPult: (id: string) => void;
  onActivity: () => void;
  onDebug: () => void;
}) {
  const { session } = useApp();
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
  const items: QuickActionItem[] = actions.map((a) => ({
    id: a.name,
    // Blackout is latched: while it is on, the same hold restores the picture.
    label: a.name === "blackout" && s.modes.blackout ? "Restore" : a.label,
    icon: ACTION_ICON[a.name],
    tone: a.hold ? "critical" : "default",
    holdMs: a.hold ? HOLD_MS : undefined,
    disabled: !canControl,
  }));

  const rows = pultRows(pults, pultId ?? undefined);
  const modeItems = modes.map((m) => ({
    id: m.name,
    label: m.label,
    icon: m.name === "idle" ? HandPalmIcon : PauseIcon,
  }));
  return (
    <View className="gap-6" testID="installation-panel">
      <View className="gap-3 pr-14">
        <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Installation
        </Text>
        <Text className="text-foreground text-xl font-semibold" numberOfLines={1}>
          {s.config?.installation.name ?? session?.displayName}
        </Text>
        <ConnectionStatus
          state={online ? "online" : s.connection === "open" ? "connecting" : "offline"}
        />
      </View>
      <View className="gap-3">
        <View className="flex-row gap-3">
          {stats.map((st) => (
            <View key={st.key} className="flex-1">
              <StatTile label={st.label} value={st.value} block />
            </View>
          ))}
        </View>
        {state.name !== "online" && state.name !== "offline" && (
          <Note>{`The installation is in ${state.label.toLowerCase()} mode.`}</Note>
        )}
      </View>

      {rows.length > 1 && (
        <Section title="Pults">
          <ListCard>
            {rows.map((p) => (
              <ListRow
                key={p.id}
                icon={iconByName(p.icon) ?? MonitorIcon}
                title={p.name}
                value={p.value}
                onPress={() => onPult(p.id)}
              />
            ))}
          </ListCard>
        </Section>
      )}

      <View className="gap-2">
        <InstallationActions
          actions={items}
          onAction={(id) => {
            const a = actions.find((x) => x.name === id);
            if (!a) return;
            const m = actionMessage(a, s.modes);
            session?.action(m.name, m.on);
          }}
          modes={modeItems}
          modeState={{ ...s.modes }}
          onModeChange={(id, on) => session?.setMode(id as "idle" | "pause", on)}
          modesDisabled={!canControl}
        />
        {!canControl && <Note>Take control to use the quick actions and modes.</Note>}
      </View>

      <ListCard>
        <ListRow
          icon={ClockCounterClockwiseIcon}
          title="Activity"
          subtitle={lastLine ? `${lastLine.title} · ${lastLine.time}` : "Nothing yet"}
          onPress={onActivity}
        />
        <ListRow icon={InfoIcon} title="Debug" subtitle="Bridge · OSC log" onPress={onDebug} />
      </ListCard>
    </View>
  );
}

/** Kind of an activity line, for the DS Activity Row's LED and icon. */
function kindOf(e: ActivityEntry): ActivityKind {
  if (e.event === "rejected" || e.event === "disconnect") return "error";
  if (e.role === "studio") return "studio";
  if (e.event === "action" && (e.name === "restart" || e.name === "blackout")) return "restart";
  return "control";
}

/** The bridge's activity feed, newest first (pushed from the Installation panel). */
function ActivityList({ onBack }: { onBack?: () => void }) {
  const { session } = useApp();
  const s = useSessionState();
  const lines = [...s.activity].reverse();
  return (
    <View className="gap-4" testID="activity-list">
      {onBack && (
        <View className="flex-row">
          <Button
            label="Installation"
            icon={CaretLeftIcon}
            variant="ghost"
            size="sm"
            onPress={onBack}
          />
        </View>
      )}
      {lines.length === 0 ? (
        <Text className="text-muted-foreground py-10 text-center">No activity yet.</Text>
      ) : (
        <ListCard>
          {lines.map((e, i) => {
            const l = activityLine(e, s.config, session?.device);
            return (
              <ActivityRow
                key={`${e.ts}-${i}`}
                kind={kindOf(e)}
                text={l.detail ? `${l.title} · ${l.detail}` : l.title}
                time={l.time}
              />
            );
          })}
        </ListCard>
      )}
    </View>
  );
}
