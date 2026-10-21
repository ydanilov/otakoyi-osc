import { Canvas, Group, Rect, RoundedRect, rect, rrect } from "@shopify/react-native-skia";
import {
  createThrottle,
  formatValue,
  positionToValue,
  relativeDrag,
  resetValue,
  startDrag,
  valueToPosition,
  type DragState,
  type Range,
} from "@osc/controls";
import * as React from "react";
import { View } from "react-native";
import {
  GestureDetector,
  usePanGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "../theme/ThemeProvider";
import { ControlFrame } from "./ControlFrame";
import type { ControlProps } from "./types";
import { useLayout } from "./useLayout";

const asNumber = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);

/** Px the finger must travel before a relative drag starts, so a tap never moves the value. */
const RELATIVE_SLOP = 4;

/**
 * Fader.
 * - `response: "relative"` (default): a touch changes nothing; dragging moves the value by the
 *   distance dragged, 1:1 with the track. Safe against accidental touches in a dark venue.
 * - `response: "absolute"`: the value jumps to the finger — opt-in per control.
 * - Two fingers: fine mode (`fineFactor`, ×0.2 by default), shown as FINE next to the value.
 * - Double-tap: back to the default value (`doubleTapReset`).
 * The gesture runs on the UI thread and the canvas reads a shared value, so drawing never waits for
 * React. Values leave through a throttle (`throttleHz`); the last value is always sent on release.
 */
export function Fader({ control: c, value, onChange, disabled }: ControlProps<"fader">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const range: Range = React.useMemo(
    () => ({ min: c.min, max: c.max, step: c.step, curve: c.curve, invert: c.invert, int: c.int }),
    [c.min, c.max, c.step, c.curve, c.invert, c.int],
  );
  const vertical = c.orientation === "vertical";
  const absolute = c.response === "absolute";
  const pos = useSharedValue(valueToPosition(asNumber(value, c.min), range));
  const dragging = useSharedValue(false);
  const drag = useSharedValue<DragState>(startDrag(0, 1));
  const [display, setDisplay] = React.useState(asNumber(value, c.min));
  const [fine, setFine] = React.useState(false);

  // Feedback from the installation or another device moves the fader, unless the finger is on it.
  React.useEffect(() => {
    if (dragging.value || typeof value !== "number") return;
    pos.value = valueToPosition(value, range);
    setDisplay(value);
  }, [value, range, pos, dragging]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const throttle = React.useMemo(
    () => createThrottle<number>(c.throttleHz, (v) => onChangeRef.current(v)),
    [c.throttleHz],
  );
  React.useEffect(() => () => throttle.cancel(), [throttle]);

  const report = React.useCallback(
    (p: number, final: boolean) => {
      const v = positionToValue(p, range);
      setDisplay(v);
      if (c.sendOn === "change") throttle.push(v);
      if (final) {
        setFine(false);
        if (c.sendOn === "release") onChangeRef.current(v);
        else throttle.flush();
      }
    },
    [range, c.sendOn, throttle],
  );

  const reset = React.useCallback(() => {
    const v = resetValue(c);
    pos.value = valueToPosition(v, range);
    setDisplay(v);
    throttle.cancel();
    onChangeRef.current(v);
  }, [c, range, pos, throttle]);

  const { width: w, height: h } = size;
  const length = vertical ? h : w;
  const fineFactor = c.fineFactor;
  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: absolute ? 0 : RELATIVE_SLOP,
    shouldCancelWhenOutside: false,
    onBegin: (e) => {
      "worklet";
      if (!absolute) return;
      dragging.value = true;
      const p = vertical ? 1 - e.y / h : e.x / w;
      pos.value = Math.min(1, Math.max(0, p));
      scheduleOnRN(report, pos.value, false);
    },
    onActivate: (e) => {
      "worklet";
      dragging.value = true;
      if (!absolute) drag.value = startDrag(pos.value, e.numberOfPointers);
    },
    onUpdate: (e) => {
      "worklet";
      if (absolute) {
        const p = vertical ? 1 - e.y / h : e.x / w;
        pos.value = Math.min(1, Math.max(0, p));
        scheduleOnRN(report, pos.value, false);
        return;
      }
      const distance = vertical ? -e.translationY : e.translationX;
      const wasFine = drag.value.pointers >= 2;
      const r = relativeDrag(
        drag.value,
        pos.value,
        distance,
        e.numberOfPointers,
        length,
        fineFactor,
      );
      drag.value = r.state;
      pos.value = r.pos;
      if (r.fine !== wasFine) scheduleOnRN(setFine, r.fine);
      scheduleOnRN(report, pos.value, false);
    },
    onFinalize: () => {
      "worklet";
      if (!dragging.value) return;
      dragging.value = false;
      scheduleOnRN(report, pos.value, true);
    },
  });
  const doubleTap = useTapGesture({
    enabled: !disabled && c.doubleTapReset,
    numberOfTaps: 2,
    onActivate: () => {
      "worklet";
      scheduleOnRN(reset);
    },
  });
  const gesture = useSimultaneousGestures(pan, doubleTap);

  // Fill geometry. Centered faders fill from the middle (bipolar values such as pan).
  const center = c.centered ? 0.5 : 0;
  const fillStart = useDerivedValue(() => Math.min(center, pos.value));
  const fillLen = useDerivedValue(() => Math.abs(pos.value - center));
  const fill = useDerivedValue(() =>
    vertical
      ? { x: 0, y: h * (1 - fillStart.value - fillLen.value), width: w, height: h * fillLen.value }
      : { x: w * fillStart.value, y: 0, width: w * fillLen.value, height: h },
  );
  const fillX = useDerivedValue(() => fill.value.x);
  const fillY = useDerivedValue(() => fill.value.y);
  const fillW = useDerivedValue(() => fill.value.width);
  const fillH = useDerivedValue(() => fill.value.height);
  const thumb = t.size.faderThumb / 2;
  const thumbX = useDerivedValue(() => (vertical ? 0 : w * pos.value - thumb / 2));
  const thumbY = useDerivedValue(() => (vertical ? h * (1 - pos.value) - thumb / 2 : 0));
  const r = t.radius.md;

  const step = (c.step ?? (c.max - c.min) / 100) * (c.invert ? -1 : 1);
  return (
    <ControlFrame
      label={c.label}
      value={c.showValue ? formatValue(display, { unit: c.unit }) : undefined}
      badge={fine ? "FINE" : undefined}
      disabled={disabled}
    >
      <GestureDetector gesture={gesture}>
        <View
          className="flex-1"
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={c.label ?? c.id}
          accessibilityValue={{ text: formatValue(display, { unit: c.unit }) }}
          accessibilityState={{ disabled: !!disabled }}
          accessibilityHint="Drag to adjust. Two fingers for fine control. Double-tap to reset."
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => {
            const next = Math.min(
              c.max,
              Math.max(c.min, display + (e.nativeEvent.actionName === "increment" ? step : -step)),
            );
            pos.value = valueToPosition(next, range);
            setDisplay(next);
            onChange(next);
          }}
        >
          {w > 0 && (
            <Canvas style={{ width: w, height: h }}>
              <RoundedRect x={0} y={0} width={w} height={h} r={r} color={t.control.track} />
              <Group clip={rrect(rect(0, 0, w, h), r, r)}>
                <Rect x={fillX} y={fillY} width={fillW} height={fillH} color={t.control.fill} />
                <Rect
                  x={thumbX}
                  y={thumbY}
                  width={vertical ? w : thumb}
                  height={vertical ? thumb : h}
                  color={t.control.thumb}
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
