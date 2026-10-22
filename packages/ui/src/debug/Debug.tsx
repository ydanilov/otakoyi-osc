import { baseTokens } from "@osc/tokens";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "../components/ui/text";
import { CONTINUOUS } from "../ds/depth";
import { useTheme } from "../theme/ThemeProvider";

/**
 * Debug overlay (Settings › Developer › Debug overlay). Mono 10 pt on a dark scrim with an amber
 * (status warning) hairline: it must read on top of any control in both modes, so its colours
 * come from the `debug` tokens and do not follow the theme mode.
 */

const MONO = "font-mono text-[10px] leading-[13px]";

/** Text on the debug scrim: the dark theme's text colours in both modes (the scrim is always dark). */
const DEBUG_TEXT = baseTokens.color.dark.text;
const DEBUG_MUTED = baseTokens.color.dark.textMuted;

/** Figma `Debug Tag`: pinned at a control's top-left — address, last value sent, send rate. */
export function DebugTag({
  address,
  value,
  rate,
}: {
  /** OSC address or template (`/wall/brightness`, `/mix/layer/{1-4}/opacity`). */
  address: string;
  /** Last value sent; "—" before the first message. */
  value?: string | undefined;
  /** Send rate, e.g. `12/s`. */
  rate?: string | undefined;
}) {
  const t = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="max-w-full flex-row gap-1.5 self-start rounded-[6px] border px-1.5 py-[3px]"
      style={[
        CONTINUOUS,
        { backgroundColor: t.debug.tagBackground, borderColor: t.status.warning },
      ]}
    >
      <Text className={MONO} style={{ color: t.status.warning }} numberOfLines={1}>
        {address}
      </Text>
      <Text className={MONO} style={{ color: DEBUG_TEXT }} numberOfLines={1}>
        {value ?? "—"}
      </Text>
      {rate !== undefined && (
        <Text className={MONO} style={{ color: DEBUG_MUTED }} numberOfLines={1}>
          {rate}
        </Text>
      )}
    </View>
  );
}

export interface DebugHudMetric {
  label: string;
  value: string;
}

export interface DebugHudLogLine {
  key: string | number;
  /** `10:21:04.218` */
  time: string;
  dir: "out" | "in";
  text: string;
}

/**
 * Figma `Debug HUD`: bridge, RTT, message rates, FPS, lease, target, last feedback, protocol /
 * config / schema versions and a live OSC log (→ sent, ← received). Tap the head to collapse.
 */
export function DebugHud({
  versions,
  metrics,
  log,
  collapsed,
  onToggle,
  maxLines = 6,
}: {
  /** Right side of the head: `proto v2 · rev 14 · schema 2`. */
  versions: string;
  metrics: DebugHudMetric[];
  log: DebugHudLogLine[];
  collapsed?: boolean;
  onToggle?: () => void;
  /** Log lines shown (newest at the bottom); the store keeps ~50. */
  maxLines?: number;
}) {
  const t = useTheme();
  const lines = log.slice(-maxLines);
  return (
    <View
      className="gap-2 rounded-[14px] border px-3 py-2.5"
      style={[
        CONTINUOUS,
        { backgroundColor: t.debug.hudBackground, borderColor: t.status.warning },
      ]}
      testID="debug-hud"
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? "Expand debug HUD" : "Collapse debug HUD"}
        aria-expanded={!collapsed}
        className="flex-row items-center"
        hitSlop={8}
      >
        <Text className={`${MONO} flex-1`} style={{ color: t.status.warning }}>
          DEBUG
        </Text>
        <Text className={MONO} style={{ color: DEBUG_MUTED }} numberOfLines={1}>
          {versions}
        </Text>
      </Pressable>
      {!collapsed && (
        <>
          <View className="flex-row flex-wrap gap-x-3.5 gap-y-1">
            {metrics.map((m) => (
              <View key={m.label} className="flex-row gap-1">
                <Text className={MONO} style={{ color: DEBUG_MUTED }}>
                  {m.label}
                </Text>
                <Text className={MONO} style={{ color: DEBUG_TEXT }} numberOfLines={1}>
                  {m.value}
                </Text>
              </View>
            ))}
          </View>
          <View className="gap-0.5" accessibilityLabel="OSC log" accessibilityRole="list">
            {lines.length === 0 ? (
              <Text className={MONO} style={{ color: DEBUG_MUTED }}>
                No OSC yet
              </Text>
            ) : (
              lines.map((l) => (
                <Text
                  key={l.key}
                  className={MONO}
                  style={{ color: l.dir === "out" ? DEBUG_TEXT : DEBUG_MUTED }}
                  numberOfLines={1}
                >
                  {l.time} {l.dir === "out" ? "→" : "←"} {l.text}
                </Text>
              ))
            )}
          </View>
        </>
      )}
    </View>
  );
}

/** Re-render every `ms` while mounted (rates decay without new events). */
export function useTicker(ms: number, enabled = true): number {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return n;
}
