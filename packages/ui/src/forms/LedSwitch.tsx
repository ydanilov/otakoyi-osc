import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";
import { Text } from "../components/ui/text";
import { Surface, useDepthStyle } from "../ds/depth";
import { Led } from "../ds/Led";
import { useTheme } from "../theme/ThemeProvider";

const TRACK_W = 64;
const TRACK_H = 32;
const THUMB = 26;
const PAD = (TRACK_H - THUMB) / 2;

/**
 * Figma `Switch`: hardware-style switch — a raised thumb with grip lines sliding in an inset bed,
 * flanked by two LEDs. Off lights the left (critical) LED, On lights the right (signal) LED.
 * The thumb slides with the token motion duration; with Reduce Motion it jumps.
 */
export function LedSwitch({
  value,
  onValueChange,
  label,
  showLabel = true,
  disabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** VoiceOver name; also shown on the left unless `showLabel` is false (e.g. inside a List Row). */
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const thumbShadow = useDepthStyle("raisedSm");
  const x = value ? TRACK_W - THUMB - PAD : PAD;
  const thumbStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: reduce ? x : withTiming(x, { duration: t.motion.duration.fast }) }],
    }),
    [x, reduce],
  );
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={value}
      aria-disabled={!!disabled}
      className="min-h-touch flex-row items-center gap-2"
      style={disabled ? { opacity: t.control.disabledOpacity } : undefined}
    >
      {showLabel && (
        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
          {label}
        </Text>
      )}
      <Led tone="critical" lit={!value && !disabled} size={6} />
      <Surface depth="inset" radius="full" style={{ width: TRACK_W, height: TRACK_H }}>
        <Animated.View
          // Reanimated views are not NativeWind-interop'd: layout and colour go in `style`.
          style={[
            {
              position: "absolute",
              top: PAD,
              left: 0,
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              backgroundColor: t.color.surfaceRaised,
            },
            thumbShadow,
            thumbStyle,
          ]}
        >
          <View
            style={{ width: 2, height: 10, borderRadius: 1, backgroundColor: t.control.tick }}
          />
          <View
            style={{ width: 2, height: 10, borderRadius: 1, backgroundColor: t.control.tick }}
          />
        </Animated.View>
      </Surface>
      <Led tone="signal" lit={value && !disabled} size={6} />
    </Pressable>
  );
}
