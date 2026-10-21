import {
  BlurMask,
  Canvas,
  Group,
  Path,
  Rect,
  RoundedRect,
  rect,
  rrect,
} from "@shopify/react-native-skia";
import {
  FINE_POINTERS,
  createDeltaAccumulator,
  fineBadge,
  formatValue,
  jogDelta,
} from "@osc/controls";
import * as React from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "../theme/ThemeProvider";
import { GLOW_BLUR, animateGlow, trackTicksPath, useFineSpread, useGlow } from "./states";
import { ControlFrame } from "./ControlFrame";
import type { ControlProps } from "./types";
import { useLayout } from "./useLayout";

/** Spacing of the ribs on the jog wheel, px. */
const RIB = 12;

/**
 * Endless jog wheel (`fader` with `mode: "relative"`, ADR-015). There is no position: dragging
 * scrolls the ribs and sends the change (a full track = max − min), summed per throttle window so
 * no movement is lost. Two fingers = fine (`fineFactor`): the ribs spread apart around the centre
 * index (×1.8) and the badge shows the coefficient. The centre index glows, fully while touched.
 */
export function JogFader({ control: c, onChange, disabled }: ControlProps<"fader">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const vertical = c.orientation === "vertical";
  const { width: w, height: h } = size;
  const length = vertical ? h : w;
  const offset = useSharedValue(0);
  const last = useSharedValue(0);
  const [fine, setFine] = React.useState(false);
  const [moved, setMoved] = React.useState(0);
  const glow = useGlow();
  const spread = useFineSpread(fine);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const acc = React.useMemo(
    () => createDeltaAccumulator(c.throttleHz, (delta) => onChangeRef.current({ delta })),
    [c.throttleHz],
  );
  React.useEffect(() => () => acc.cancel(), [acc]);

  const span = c.max - c.min;
  const fineFactor = c.fineFactor;
  const push = React.useCallback(
    (px: number, pointers: number) => {
      const isFine = pointers >= FINE_POINTERS;
      setFine(isFine);
      const d = jogDelta(px, length, span, isFine ? fineFactor : 1);
      setMoved((m) => m + d);
      acc.push(d);
    },
    [acc, length, span, fineFactor],
  );
  const end = React.useCallback(() => {
    setFine(false);
    acc.flush();
  }, [acc]);

  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 2,
    onBegin: () => {
      "worklet";
      animateGlow(glow, true);
    },
    onActivate: () => {
      "worklet";
      last.value = 0;
    },
    onUpdate: (e) => {
      "worklet";
      const dist = vertical ? -e.translationY : e.translationX;
      const step = dist - last.value;
      last.value = dist;
      offset.value = offset.value + step;
      scheduleOnRN(push, step, e.numberOfPointers);
    },
    onFinalize: () => {
      "worklet";
      animateGlow(glow, false);
      scheduleOnRN(end);
    },
  });

  // Ribs every RIB px that scroll with the drag; in fine mode they spread around the centre.
  const ribs = Math.max(2, Math.round(length / RIB) + 1);
  const ribLen = Math.max(4, (vertical ? w : h) * 0.3);
  const ribPath = useDerivedValue(() => {
    const phase = length > 0 ? offset.value / length : 0;
    return trackTicksPath(ribs, 0.5, spread.value, phase, w, h, vertical, ribLen);
  });
  const r = t.radius.md;
  return (
    <ControlFrame
      label={c.label}
      value={c.showValue ? formatValue(moved, { unit: c.unit }) : undefined}
      badge={fine ? fineBadge(fineFactor) : undefined}
      disabled={disabled}
    >
      <GestureDetector gesture={pan}>
        <View
          className="flex-1"
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={c.label ?? c.id}
          accessibilityHint="Endless. Drag to nudge."
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => {
            const d = (c.step ?? span / 100) * (e.nativeEvent.actionName === "increment" ? 1 : -1);
            onChange({ delta: d });
          }}
        >
          {w > 0 && (
            <Canvas style={{ width: w, height: h }}>
              <RoundedRect x={0} y={0} width={w} height={h} r={r} color={t.control.track} />
              <Group clip={rrect(rect(0, 0, w, h), r, r)}>
                <Path
                  path={ribPath}
                  color={t.control.tick}
                  style="stroke"
                  strokeWidth={t.stroke.strong}
                  strokeCap="round"
                />
                {/* Centre index: the point the ribs move past. Glows (fully while touched). */}
                <Rect
                  x={vertical ? 0 : w / 2 - t.stroke.strong / 2}
                  y={vertical ? h / 2 - t.stroke.strong / 2 : 0}
                  width={vertical ? w : t.stroke.strong}
                  height={vertical ? t.stroke.strong : h}
                  color={t.control.fill}
                  opacity={glow}
                >
                  <BlurMask blur={GLOW_BLUR} style="outer" />
                </Rect>
                <Rect
                  x={vertical ? 0 : w / 2 - t.stroke.strong / 2}
                  y={vertical ? h / 2 - t.stroke.strong / 2 : 0}
                  width={vertical ? w : t.stroke.strong}
                  height={vertical ? t.stroke.strong : h}
                  color={t.control.fill}
                />
              </Group>
              <RoundedRect
                x={0.5}
                y={0.5}
                width={w - 1}
                height={h - 1}
                r={r}
                color={fine ? t.color.focus : t.control.trackBorder}
                style="stroke"
                strokeWidth={fine ? t.stroke.strong : 1}
              />
            </Canvas>
          )}
        </View>
      </GestureDetector>
    </ControlFrame>
  );
}
