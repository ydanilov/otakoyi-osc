import * as React from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { IconButton } from "../chrome/Button";
import { Scrim } from "../chrome/Scrim";
import { Text } from "../components/ui/text";
import { useDepthStyle } from "../ds/depth";
import { XIcon } from "../ds/icons";
import { drawerStaysOpen, drawerWidth, edgeSwipeOpens } from "../ds/logic";
import { useTheme } from "../theme/ThemeProvider";

export type DrawerSide = "left" | "right";

/**
 * Swipe drawers (ADR-013 addendum): left = Settings, right = Installation. They slide over the pult
 * from the screen edge, and — unlike the pult — may scroll vertically. Drag toward the edge or tap
 * the scrim to close (`drawerStaysOpen` decides on release). Place inside the full-screen pult view;
 * pair with `DrawerEdge` to open by swiping from the edge.
 */
export function Drawer({
  side,
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  side: DrawerSide;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** Pinned under the scrolling content (e.g. Sign out). */
  footer?: React.ReactNode;
}) {
  const t = useTheme();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const width = drawerWidth(win.width);
  const shadow = useDepthStyle("raised");
  const dir = side === "left" ? -1 : 1;
  /** 0 = fully open, width = fully closed. */
  const offset = useSharedValue(open ? 0 : width);
  const travel = useSharedValue(0);
  const velocity = useSharedValue(0);
  const [mounted, setMounted] = React.useState(open);

  React.useEffect(() => {
    if (open) setMounted(true);
    const to = open ? 0 : width;
    const done = (finished?: boolean) => {
      "worklet";
      if (finished && !open) scheduleOnRN(setMounted, false);
    };
    offset.value = reduce ? to : withTiming(to, { duration: t.motion.duration.base }, done);
    if (reduce && !open) setMounted(false);
  }, [open, width, reduce, offset, t.motion.duration.base]);

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      "worklet";
      // Positive = toward the drawer's own edge (closing).
      travel.value = Math.max(0, Math.min(width, dir * e.translationX));
      velocity.value = dir * e.velocityX;
      offset.value = travel.value;
    },
    onFinalize: () => {
      "worklet";
      if (drawerStaysOpen(travel.value, velocity.value, width)) {
        offset.value = withTiming(0, { duration: 150 });
      } else {
        scheduleOnRN(close);
      }
      travel.value = 0;
      velocity.value = 0;
    },
  });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: dir * offset.value }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: 1 - offset.value / width }));
  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, scrim]}>
        <Scrim onPress={close} dismissLabel={`Dismiss ${title}`} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          // Reanimated views are not NativeWind-interop'd: layout and colour go in `style`.
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              width,
              [side]: 0,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              backgroundColor: t.color.background,
            },
            shadow,
            panel,
          ]}
          accessibilityViewIsModal
          aria-modal
          accessibilityLabel={title}
        >
          <View className="min-h-14 flex-row items-center gap-3 px-4">
            <Text
              className="text-foreground flex-1 text-xl font-semibold"
              accessibilityRole="header"
              numberOfLines={1}
            >
              {title}
            </Text>
            <IconButton icon={XIcon} label={`Close ${title}`} size={32} onPress={close} />
          </View>
          <ScrollView contentContainerClassName="gap-6 px-4 pb-6 pt-2">{children}</ScrollView>
          {footer ? <View className="px-4 pb-4">{footer}</View> : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Invisible strip on a screen edge that opens a drawer with a swipe toward the centre.
 * 20 pt wide so it does not steal touches from pult controls near the edge.
 */
export function DrawerEdge({ side, onOpen }: { side: DrawerSide; onOpen: () => void }) {
  const win = useWindowDimensions();
  const width = drawerWidth(win.width);
  const dir = side === "left" ? 1 : -1;
  const distance = useSharedValue(0);
  const velocity = useSharedValue(0);
  const pan = usePanGesture({
    activeOffsetX: dir > 0 ? [-1000, 8] : [-8, 1000],
    failOffsetY: [-16, 16],
    onUpdate: (e) => {
      "worklet";
      distance.value = dir * e.translationX;
      velocity.value = dir * e.velocityX;
    },
    onFinalize: () => {
      "worklet";
      if (edgeSwipeOpens(distance.value, velocity.value, width)) scheduleOnRN(onOpen);
      distance.value = 0;
      velocity.value = 0;
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View
        className="absolute bottom-0 top-0"
        style={{ width: 20, [side]: 0 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </GestureDetector>
  );
}
