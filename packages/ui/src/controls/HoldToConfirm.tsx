import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import * as React from "react";
import { Pressable, View } from "react-native";
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { useTheme } from "../theme/ThemeProvider";
import type { ControlProps } from "./types";
import { TouchLightView, usePressLight, useTouchLight } from "./TouchLight";
import { useLayout } from "./useLayout";

/**
 * Critical actions (blackout, shutdown, reset). The command is sent only after the button is held
 * for `holdMs`; releasing early cancels. Progress is drawn as a ring around the button edge.
 */
export function HoldToConfirm({ control: c, onChange, disabled }: ControlProps<"holdToConfirm">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const progress = useSharedValue(0);
  const [state, setState] = React.useState<"idle" | "holding" | "done">("idle");
  const critical = c.tone === "critical";
  const accent = critical ? t.status.critical : t.control.fill;

  const confirm = React.useCallback(() => {
    setState("done");
    onChange(true);
    setTimeout(() => setState("idle"), 1200);
  }, [onChange]);

  const onPressIn = () => {
    if (disabled) return;
    setState("holding");
    progress.value = withTiming(1, { duration: c.holdMs, easing: Easing.linear }, (finished) => {
      "worklet";
      if (finished) scheduleOnRN(confirm);
    });
  };
  const onPressOut = () => {
    if (state === "done") return;
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: t.motion.duration.fast });
    setState("idle");
  };

  const light = useTouchLight({ disabled: !!disabled });
  const lit = usePressLight(light, { onPressIn, onPressOut });

  const { width: w, height: h } = size;
  const inset = t.size.holdRing / 2;
  const ring = React.useMemo(() => {
    return Skia.PathBuilder.Make()
      .addRRect(
        Skia.RRectXY(
          Skia.XYWHRect(inset, inset, w - inset * 2, h - inset * 2),
          t.radius.md,
          t.radius.md,
        ),
      )
      .build();
  }, [w, h, inset, t.radius.md]);
  const end = useDerivedValue(() => progress.value);

  const label = state === "holding" ? "Hold…" : state === "done" ? "Sent" : (c.label ?? "Hold");
  return (
    <Pressable
      ref={lit.ref}
      onPressIn={lit.onPressIn}
      onPressMove={lit.onPressMove}
      onPressOut={lit.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={c.label ?? c.id}
      accessibilityHint={`Press and hold for ${(c.holdMs / 1000).toFixed(1)} seconds to confirm`}
      className={cn("flex-1", disabled && "opacity-40")}
    >
      <View
        onLayout={onLayout}
        className={cn(
          "bg-card flex-1 items-center justify-center rounded-md border border-border",
          state === "done" && "bg-destructive",
        )}
      >
        {/* Touch light: inside the button, below the ring and the label. */}
        <TouchLightView light={light} radius={t.radius.md} />
        {w > 0 && (
          <Canvas style={{ position: "absolute", width: w, height: h }} pointerEvents="none">
            <Path
              path={ring}
              color={accent}
              style="stroke"
              strokeWidth={t.size.holdRing}
              start={0}
              end={end}
              strokeCap="round"
            />
          </Canvas>
        )}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className={cn(
            "px-2 text-sm font-semibold uppercase tracking-wider",
            critical ? "text-status-critical" : "text-foreground",
            state === "done" && "text-foreground",
          )}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
