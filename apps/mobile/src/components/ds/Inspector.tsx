// TODO(ds): replace with @osc/ui inspector component from feat/ds-components-storybook.
import * as React from "react";
import { View } from "react-native";
import Animated, { SlideInRight, SlideOutRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * iPad inspector (ADR-013): a panel on the trailing side over the console — fixed width, its own
 * Close button, no dimming, so the console stays visible and usable beside it.
 */
export function Inspector({ width, children }: { width: number; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={SlideInRight.duration(220)}
      exiting={SlideOutRight.duration(180)}
      style={{ position: "absolute", top: 0, bottom: 0, right: 0, width, paddingTop: insets.top }}
      className="bg-card border-border border-l shadow-2xl shadow-black/40"
      accessibilityViewIsModal={false}
      testID="inspector"
    >
      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
        {children}
      </View>
    </Animated.View>
  );
}
