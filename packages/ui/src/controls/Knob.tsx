import { Canvas, Circle, Line, Path, Skia, vec } from "@shopify/react-native-skia";
import {
  KNOB_START,
  KNOB_SWEEP,
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

/** Pixels of vertical drag for a full sweep. Relative drag avoids jumps when the knob is touched. */
const SWEEP_PX = 220;

/**
 * Rotary knob: 270° arc, relative drag up/right to increase (a touch never moves it).
 * Two fingers = fine mode (`fineFactor`); double-tap = back to default (`doubleTapReset`).
 */
export function Knob({ control: c, value, onChange, disabled }: ControlProps<"knob">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const range: Range = React.useMemo(
    () => ({ min: c.min, max: c.max, step: c.step, curve: c.curve, invert: c.invert, int: c.int }),
    [c.min, c.max, c.step, c.curve, c.invert, c.int],
  );
  const initial = typeof value === "number" ? value : c.centered ? (c.min + c.max) / 2 : c.min;
  const pos = useSharedValue(valueToPosition(initial, range));
  const drag = useSharedValue<DragState>(startDrag(0, 1));
  const dragging = useSharedValue(false);
  const [display, setDisplay] = React.useState(initial);
  const [fine, setFine] = React.useState(false);

  React.useEffect(() => {
    if (dragging.value || typeof value !== "number" || c.endless) return;
    pos.value = valueToPosition(value, range);
    setDisplay(value);
  }, [value, range, pos, dragging, c.endless]);

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

  const fineFactor = c.fineFactor;
  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 4,
    onActivate: (e) => {
      "worklet";
      dragging.value = true;
      drag.value = startDrag(pos.value, e.numberOfPointers);
    },
    onUpdate: (e) => {
      "worklet";
      const wasFine = drag.value.pointers >= 2;
      const r = relativeDrag(
        drag.value,
        pos.value,
        e.translationX - e.translationY,
        e.numberOfPointers,
        SWEEP_PX,
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

  const { width: w, height: h } = size;
  const d = Math.min(w, h);
  const stroke = t.size.knobArc;
  const r = d / 2 - stroke;
  const cx = w / 2;
  const cy = h / 2;
  const oval = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);
  // Skia measures angles from 3 o'clock; ours from 12 o'clock.
  const skStart = KNOB_START - 90;
  const track = React.useMemo(() => {
    return Skia.PathBuilder.Make().addArc(oval, skStart, KNOB_SWEEP).build();
  }, [oval.x, oval.y, oval.width, skStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const centerPos = c.centered ? 0.5 : 0;
  const fillPath = useDerivedValue(() => {
    const from = skStart + centerPos * KNOB_SWEEP;
    return Skia.PathBuilder.Make()
      .addArc(oval, from, (pos.value - centerPos) * KNOB_SWEEP)
      .build();
  });
  const tip = useDerivedValue(() => {
    const a = ((KNOB_START + pos.value * KNOB_SWEEP - 90) * Math.PI) / 180;
    return vec(cx + Math.cos(a) * (r - stroke * 2), cy + Math.sin(a) * (r - stroke * 2));
  });
  const innerTip = useDerivedValue(() => {
    const a = ((KNOB_START + pos.value * KNOB_SWEEP - 90) * Math.PI) / 180;
    return vec(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25);
  });

  const step = c.step ?? (c.max - c.min) / 100;
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
          {d > 0 && (
            <Canvas style={{ width: w, height: h }}>
              <Path
                path={track}
                color={t.control.track}
                style="stroke"
                strokeWidth={stroke}
                strokeCap="round"
              />
              <Path
                path={fillPath}
                color={t.control.fill}
                style="stroke"
                strokeWidth={stroke}
                strokeCap="round"
              />
              <Circle cx={cx} cy={cy} r={r - stroke * 1.5} color={t.color.surfaceRaised} />
              <Line
                p1={innerTip}
                p2={tip}
                color={t.control.thumb}
                strokeWidth={t.stroke.strong}
                strokeCap="round"
              />
            </Canvas>
          )}
        </View>
      </GestureDetector>
    </ControlFrame>
  );
}
