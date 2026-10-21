import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

/**
 * Figma `Scrim`: dims and blurs whatever is behind a dialog, sheet or drawer. Tapping it dismisses
 * the overlay when `onPress` is given. Blur is a native effect on iOS and `backdrop-filter` on web;
 * Android without a blur target falls back to the dim layer alone.
 */
export function Scrim({
  onPress,
  intensity = 24,
  dismissLabel = "Close",
}: {
  onPress?: () => void;
  /** Blur strength 1–100. */
  intensity?: number;
  dismissLabel?: string;
}) {
  const t = useTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={onPress ? "auto" : "none"}>
      <BlurView intensity={intensity} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.color.overlay }]} />
      {onPress && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
        />
      )}
    </View>
  );
}
