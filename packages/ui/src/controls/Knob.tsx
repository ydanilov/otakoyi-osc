import {
  Canvas,
  Circle,
  Group,
  Line,
  Path,
  Skia,
  SweepGradient,
  vec,
} from "@shopify/react-native-skia";
import {
  FINE_POINTERS,
  createDeltaAccumulator,
  createThrottle,
  formatValue,
  hsvToHex,
  hueDrag,
  jogDelta,
  knobMode,
  knobStart,
  positionToValue,
  relativeDrag,
  resetValue,
  startDrag,
  valueToPosition,
  wrapHue,
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

/** Pixels of drag for a full sweep. Relative drag avoids jumps when the knob is touched. */
const SWEEP_PX = 220;

/** The hue ring's colours, computed (not hand-picked): 0°, 60°, … 360°. */
const HUE_STOPS = Array.from({ length: 7 }, (_, i) => hsvToHex(i / 6, 1, 1));

/**
 * Rotary knob (ADR-015), relative drag up/right to increase (a touch never moves it).
 * - `absolute`: arc over `travel` degrees (240° by default), hard stops at min and max.
 * - `relative`: endless encoder, the needle turns freely and the change is sent.
 * - `hue`: colour wheel, 0..360° that wraps around.
 * Two fingers = fine mode (`fineFactor`); double-tap = back to default (absolute and hue).
 */
export function Knob(props: ControlProps<"knob">) {
  const mode = knobMode(props.control);
  if (mode === "relative") return <EncoderKnob {...props} />;
  if (mode === "hue") return <HueKnob {...props} />;
  return <AbsoluteKnob {...props} />;
}

/** Circle geometry shared by the three knobs. */
function useDial(size: { width: number; height: number }) {
  const t = useTheme();
  const { width: w, height: h } = size;
  const d = Math.min(w, h);
  const stroke = t.size.knobArc;
  const r = d / 2 - stroke;
  return { w, h, d, stroke, r, cx: w / 2, cy: h / 2 };
}

/** Needle end points for an angle (degrees, 0 = up, clockwise). */
const needle = (deg: number, cx: number, cy: number, from: number, to: number) => {
  "worklet";
  const a = ((deg - 90) * Math.PI) / 180;
  return {
    p1: vec(cx + Math.cos(a) * from, cy + Math.sin(a) * from),
    p2: vec(cx + Math.cos(a) * to, cy + Math.sin(a) * to),
  };
};

function AbsoluteKnob({ control: c, value, onChange, disabled }: ControlProps<"knob">) {
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

  const { w, h, d, stroke, r, cx, cy } = useDial(size);
  const travel = c.travel;
  const start = knobStart(travel);
  const oval = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);
  // Skia measures angles from 3 o'clock; ours from 12 o'clock.
  const skStart = start - 90;
  const track = React.useMemo(() => {
    return Skia.PathBuilder.Make().addArc(oval, skStart, travel).build();
  }, [oval.x, oval.y, oval.width, skStart, travel]); // eslint-disable-line react-hooks/exhaustive-deps

  const centerPos = c.centered ? 0.5 : 0;
  const fillPath = useDerivedValue(() => {
    const from = skStart + centerPos * travel;
    return Skia.PathBuilder.Make()
      .addArc(oval, from, (pos.value - centerPos) * travel)
      .build();
  });
  const tip = useDerivedValue(
    () => needle(start + pos.value * travel, cx, cy, r * 0.25, r - stroke * 2).p2,
  );
  const innerTip = useDerivedValue(
    () => needle(start + pos.value * travel, cx, cy, r * 0.25, r - stroke * 2).p1,
  );

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

/** Endless encoder: full ring, the needle turns with the finger, the change is sent. */
function EncoderKnob({ control: c, onChange, disabled }: ControlProps<"knob">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const angle = useSharedValue(0);
  const last = useSharedValue(0);
  const [fine, setFine] = React.useState(false);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const acc = React.useMemo(
    () => createDeltaAccumulator(c.throttleHz, (delta) => onChangeRef.current({ delta })),
    [c.throttleHz],
  );
  React.useEffect(() => () => acc.cancel(), [acc]);
  const span = c.max - c.min;
  const travel = c.travel;
  const fineFactor = c.fineFactor;
  const push = React.useCallback(
    (px: number, pointers: number) => {
      const isFine = pointers >= FINE_POINTERS;
      setFine(isFine);
      acc.push(jogDelta(px, SWEEP_PX, span, isFine ? fineFactor : 1));
    },
    [acc, span, fineFactor],
  );
  const end = React.useCallback(() => {
    setFine(false);
    acc.flush();
  }, [acc]);

  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 4,
    onActivate: () => {
      "worklet";
      last.value = 0;
    },
    onUpdate: (e) => {
      "worklet";
      const dist = e.translationX - e.translationY;
      const step = dist - last.value;
      last.value = dist;
      const factor = e.numberOfPointers >= 2 ? fineFactor : 1;
      angle.value = angle.value + (step / SWEEP_PX) * travel * factor;
      scheduleOnRN(push, step, e.numberOfPointers);
    },
    onFinalize: () => {
      "worklet";
      scheduleOnRN(end);
    },
  });

  const { w, h, d, stroke, r, cx, cy } = useDial(size);
  const p1 = useDerivedValue(() => needle(angle.value, cx, cy, r * 0.25, r - stroke * 2).p1);
  const p2 = useDerivedValue(() => needle(angle.value, cx, cy, r * 0.25, r - stroke * 2).p2);
  return (
    <ControlFrame label={c.label} badge={fine ? "FINE" : undefined} disabled={disabled}>
      <GestureDetector gesture={pan}>
        <View
          className="flex-1"
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={c.label ?? c.id}
          accessibilityHint="Endless. Turn to nudge."
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) =>
            onChange({
              delta: (c.step ?? span / 100) * (e.nativeEvent.actionName === "increment" ? 1 : -1),
            })
          }
        >
          {d > 0 && (
            <Canvas style={{ width: w, height: h }}>
              <Circle
                cx={cx}
                cy={cy}
                r={r}
                color={t.control.track}
                style="stroke"
                strokeWidth={stroke}
              />
              <Circle cx={cx} cy={cy} r={r - stroke * 1.5} color={t.color.surfaceRaised} />
              <Line
                p1={p1}
                p2={p2}
                color={t.control.fill}
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

/** Colour wheel: hue ring, the cap shows the current colour, wraps past 360°. */
function HueKnob({ control: c, value, onChange, disabled }: ControlProps<"knob">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const initial = typeof value === "number" ? wrapHue(value) : wrapHue(c.default ?? 0);
  const hue = useSharedValue(initial);
  const startHue = useSharedValue(initial);
  const dragging = useSharedValue(false);
  const [display, setDisplay] = React.useState(initial);
  const [fine, setFine] = React.useState(false);

  React.useEffect(() => {
    if (dragging.value || typeof value !== "number") return;
    hue.value = wrapHue(value);
    setDisplay(wrapHue(value));
  }, [value, hue, dragging]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const throttle = React.useMemo(
    () => createThrottle<number>(c.throttleHz, (v) => onChangeRef.current(v)),
    [c.throttleHz],
  );
  React.useEffect(() => () => throttle.cancel(), [throttle]);
  const report = React.useCallback(
    (h: number, final: boolean, isFine: boolean) => {
      const v = c.int ? Math.round(h) % 360 : h;
      setDisplay(v);
      setFine(isFine && !final);
      throttle.push(v);
      if (final) throttle.flush();
    },
    [throttle, c.int],
  );
  const reset = React.useCallback(() => {
    const v = wrapHue(c.default ?? 0);
    hue.value = v;
    setDisplay(v);
    throttle.cancel();
    onChangeRef.current(v);
  }, [c.default, hue, throttle]);

  const fineFactor = c.fineFactor;
  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 4,
    onActivate: () => {
      "worklet";
      dragging.value = true;
      startHue.value = hue.value;
    },
    onUpdate: (e) => {
      "worklet";
      const factor = e.numberOfPointers >= 2 ? fineFactor : 1;
      // One full turn per 1.5 sweeps of drag: precise enough to land on a colour.
      hue.value = hueDrag(startHue.value, e.translationX - e.translationY, SWEEP_PX * 1.5, factor);
      scheduleOnRN(report, hue.value, false, e.numberOfPointers >= 2);
    },
    onFinalize: () => {
      "worklet";
      if (!dragging.value) return;
      dragging.value = false;
      scheduleOnRN(report, hue.value, true, false);
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

  const { w, h, d, stroke, r, cx, cy } = useDial(size);
  const dot = useDerivedValue(() => needle(hue.value, cx, cy, 0, r).p2);
  const dotX = useDerivedValue(() => dot.value.x);
  const dotY = useDerivedValue(() => dot.value.y);
  const current = hsvToHex(display / 360, 1, 1);
  return (
    <ControlFrame
      label={c.label}
      value={c.showValue ? formatValue(Math.round(display), { unit: c.unit ?? "°" }) : undefined}
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
          accessibilityValue={{ text: `${Math.round(display)}°` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => {
            const next = wrapHue(display + (e.nativeEvent.actionName === "increment" ? 10 : -10));
            hue.value = next;
            setDisplay(next);
            onChange(next);
          }}
        >
          {d > 0 && (
            <Canvas style={{ width: w, height: h }}>
              {/* Rotate so hue 0 sits at the top, like the needle. */}
              <Group transform={[{ rotate: -Math.PI / 2 }]} origin={vec(cx, cy)}>
                <Circle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={stroke}>
                  <SweepGradient c={vec(cx, cy)} colors={HUE_STOPS} />
                </Circle>
              </Group>
              <Circle cx={cx} cy={cy} r={r - stroke * 1.5} color={t.color.surfaceRaised} />
              <Circle cx={cx} cy={cy} r={(r - stroke * 1.5) * 0.45} color={current} />
              <Circle cx={dotX} cy={dotY} r={stroke * 1.4} color={t.control.thumb} />
            </Canvas>
          )}
        </View>
      </GestureDetector>
    </ControlFrame>
  );
}
