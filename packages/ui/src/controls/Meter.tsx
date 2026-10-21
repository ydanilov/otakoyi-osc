import { Canvas, Group, Rect, RoundedRect, rect, rrect } from "@shopify/react-native-skia";
import { clamp, formatValue, meterLevel } from "@osc/controls";
import * as React from "react";
import { View } from "react-native";
import { useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { ControlFrame } from "./ControlFrame";
import type { ControlProps } from "./types";
import { useLayout } from "./useLayout";

/** Display-only level meter. Colour switches to the (non-brandable) warning / critical status tokens. */
export function Meter({ control: c, value }: ControlProps<"meter">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const v = typeof value === "number" ? value : c.min;
  const level = useSharedValue(clamp((v - c.min) / (c.max - c.min)));

  React.useEffect(() => {
    level.value = withTiming(clamp((v - c.min) / (c.max - c.min)), {
      duration: t.motion.duration.instant,
    });
  }, [v, c.min, c.max, level, t.motion.duration.instant]);

  const status = meterLevel(v, c);
  const color =
    status === "critical"
      ? t.status.critical
      : status === "warning"
        ? t.status.warning
        : t.control.fill;
  const vertical = c.orientation === "vertical";
  const { width: w, height: h } = size;
  const x = useDerivedValue(() => 0);
  const y = useDerivedValue(() => (vertical ? h * (1 - level.value) : 0));
  const fw = useDerivedValue(() => (vertical ? w : w * level.value));
  const fh = useDerivedValue(() => (vertical ? h * level.value : h));
  const r = t.radius.sm;

  return (
    <ControlFrame label={c.label} value={formatValue(v)}>
      <View
        className="flex-1"
        onLayout={onLayout}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={c.label ?? c.id}
        accessibilityValue={{ min: c.min, max: c.max, now: v }}
      >
        {w > 0 && (
          <Canvas style={{ width: w, height: h }}>
            <RoundedRect x={0} y={0} width={w} height={h} r={r} color={t.control.track} />
            <Group clip={rrect(rect(0, 0, w, h), r, r)}>
              <Rect x={x} y={y} width={fw} height={fh} color={color} />
            </Group>
          </Canvas>
        )}
      </View>
    </ControlFrame>
  );
}
