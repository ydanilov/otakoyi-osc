import { holdProgress } from "@osc/controls";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import * as Haptics from "expo-haptics";
import * as React from "react";
import { Pressable, View } from "react-native";

/** How long Restart / Blackout must be held (ADR-016 hold-to-confirm). */
export const HOLD_MS = 900;

/**
 * An installation quick action. A tap triggers Flash; Restart and Blackout fill while held and
 * fire only when the hold completes (releasing early cancels). Blackout shows its latched state.
 */
export function QuickActionButton({
  label,
  hold,
  on,
  disabled,
  haptics,
  onTrigger,
}: {
  label: string;
  hold: boolean;
  /** Latched state (Blackout on). */
  on?: boolean;
  disabled?: boolean;
  haptics?: boolean;
  onTrigger: () => void;
}) {
  const [progress, setProgress] = React.useState(0);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  React.useEffect(() => stop, []);
  const fire = () => {
    if (haptics)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onTrigger();
  };
  const start = () => {
    if (!hold || disabled) return;
    const t0 = Date.now();
    stop();
    timer.current = setInterval(() => {
      const p = holdProgress(Date.now() - t0, HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stop();
        setProgress(0);
        fire();
      }
    }, 16);
  };
  const cancel = () => {
    stop();
    setProgress(0);
  };
  return (
    <Pressable
      disabled={disabled}
      onPress={hold ? undefined : fire}
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel={hold ? `${label}, hold to confirm` : label}
      accessibilityState={{ disabled: !!disabled, selected: !!on }}
      accessibilityActions={hold ? [{ name: "activate", label }] : undefined}
      onAccessibilityAction={hold ? () => fire() : undefined}
      testID={`quick-${label.toLowerCase()}`}
      className={cn(
        "min-h-20 flex-1 justify-between overflow-hidden rounded-xl border p-3",
        on ? "border-status-critical bg-status-critical/15" : "border-border bg-secondary",
        disabled && "opacity-40",
      )}
    >
      {hold && (
        <View
          pointerEvents="none"
          className="bg-status-critical/25 absolute bottom-0 left-0 top-0"
          style={{ width: `${progress * 100}%` }}
        />
      )}
      <Text className="text-foreground text-[15px] font-semibold">{label}</Text>
      <Text className="text-muted-foreground text-xs">
        {hold ? (progress > 0 ? "Keep holding…" : on ? "On · hold to turn off" : "Hold") : "Tap"}
      </Text>
    </Pressable>
  );
}
