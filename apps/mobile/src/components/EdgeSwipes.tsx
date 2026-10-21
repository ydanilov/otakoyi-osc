import * as React from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import {
  EDGE_WIDTH,
  edgeSwipe,
  edgeTarget,
  type Edge,
  type FormFactor,
  type Panel,
} from "@/lib/nav";

/**
 * Edge swipes are shortcuts only (ADR-013): right edge → Installation everywhere, left edge →
 * Settings on phone only (on iPad the leading edge belongs to the system). The header buttons
 * are always the way in.
 */
export function EdgeSwipes({ ff, onOpen }: { ff: FormFactor; onOpen: (p: Panel) => void }) {
  return (
    <>
      {edgeTarget("left", ff) && <EdgeStrip edge="left" ff={ff} onOpen={onOpen} />}
      <EdgeStrip edge="right" ff={ff} onOpen={onOpen} />
    </>
  );
}

function EdgeStrip({
  edge,
  ff,
  onOpen,
}: {
  edge: Edge;
  ff: FormFactor;
  onOpen: (p: Panel) => void;
}) {
  const dx = React.useRef(0);
  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetX: edge === "left" ? [-1000, 12] : [-12, 1000],
    failOffsetY: [-24, 24],
    onUpdate: (e) => {
      dx.current = e.translationX;
    },
    onFinalize: () => {
      const target = edgeSwipe(edge, dx.current, ff);
      dx.current = 0;
      if (target) onOpen(target);
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View
        testID={`edge-${edge}`}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: EDGE_WIDTH,
          [edge]: 0,
        }}
      />
    </GestureDetector>
  );
}
