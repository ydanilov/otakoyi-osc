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
  createThrottle,
  crossfadeMix,
  crossfadePosition,
  crossfadeShares,
  fineBadge,
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
import { Text } from "@osc/ui/components/ui/text";
import {
  GestureDetector,
  usePanGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "../theme/ThemeProvider";
import { GLOW_BLUR, animateGlow, trackTicksPath, useFineSpread, useGlow } from "./states";
import { ControlFrame } from "./ControlFrame";
import { JogFader } from "./Jog";
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
 * - Two fingers: fine mode (`fineFactor`, ×0.2 by default): the badge shows the coefficient
 *   (`×0.2`) and the tick marks spread apart around the thumb.
 * - Glow: full while the finger is on it (active), softer at rest (`@osc/controls` states).
 * - Double-tap: back to the default value (`doubleTapReset`).
 * The gesture runs on the UI thread and the canvas reads a shared value, so drawing never waits for
 * React. Values leave through a throttle (`throttleHz`); the last value is always sent on release.
 *
 * `mode: "crossfade"` (ADR-015) fills from the centre, holds a detent at 50 % and shows the A / B
 * labels with their shares; `mode: "relative"` is an endless jog wheel (`JogFader`).
 */
export function Fader(props: ControlProps<"fader">) {
  return props.control.mode === "relative" ? <JogFader {...props} /> : <PositionFader {...props} />;
}

function PositionFader({ control: c, value, onChange, disabled }: ControlProps<"fader">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const crossfade = c.mode === "crossfade";
  const detent = c.detent;
  const range: Range = React.useMemo(
    () =>
      crossfade
        ? { min: c.min, max: c.max, step: c.step, int: c.int }
        : { min: c.min, max: c.max, step: c.step, curve: c.curve, invert: c.invert, int: c.int },
    [crossfade, c.min, c.max, c.step, c.curve, c.invert, c.int],
  );
  // Track position ↔ value. A crossfade has a centre detent between the two.
  const toPos = React.useCallback(
    (v: number) => {
      const p = valueToPosition(v, range);
      return crossfade ? crossfadePosition(p, detent) : p;
    },
    [range, crossfade, detent],
  );
  const toValue = React.useCallback(
    (p: number) => positionToValue(crossfade ? crossfadeMix(p, detent) : p, range),
    [range, crossfade, detent],
  );
  const vertical = c.orientation === "vertical";
  const absolute = c.response === "absolute";
  const pos = useSharedValue(toPos(asNumber(value, c.min)));
  const dragging = useSharedValue(false);
  const drag = useSharedValue<DragState>(startDrag(0, 1));
  const [display, setDisplay] = React.useState(asNumber(value, c.min));
  const [fine, setFine] = React.useState(false);
  const glow = useGlow();
  const spread = useFineSpread(fine);

  // Feedback from the installation or another device moves the fader, unless the finger is on it.
  React.useEffect(() => {
    if (dragging.value || typeof value !== "number") return;
    pos.value = toPos(value);
    setDisplay(value);
  }, [value, toPos, pos, dragging]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const throttle = React.useMemo(
    () => createThrottle<number>(c.throttleHz, (v) => onChangeRef.current(v)),
    [c.throttleHz],
  );
  React.useEffect(() => () => throttle.cancel(), [throttle]);

  const report = React.useCallback(
    (p: number, final: boolean) => {
      const v = toValue(p);
      setDisplay(v);
      if (c.sendOn === "change") throttle.push(v);
      if (final) {
        setFine(false);
        if (c.sendOn === "release") onChangeRef.current(v);
        else throttle.flush();
      }
    },
    [toValue, c.sendOn, throttle],
  );

  const reset = React.useCallback(() => {
    const v = crossfade ? (c.default ?? (c.min + c.max) / 2) : resetValue(c);
    pos.value = toPos(v);
    setDisplay(v);
    throttle.cancel();
    onChangeRef.current(v);
  }, [c, crossfade, toPos, pos, throttle]);

  const { width: w, height: h } = size;
  const length = vertical ? h : w;
  const fineFactor = c.fineFactor;
  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: absolute ? 0 : RELATIVE_SLOP,
    shouldCancelWhenOutside: false,
    onBegin: (e) => {
      "worklet";
      animateGlow(glow, true);
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
      animateGlow(glow, false);
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
  const center = c.centered || crossfade ? 0.5 : 0;
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
  // Tick marks along both long edges (every 10 %); in fine mode they spread around the thumb.
  const tickLen = Math.max(4, (vertical ? w : h) * 0.16);
  const ticks = useDerivedValue(() =>
    trackTicksPath(11, pos.value, spread.value, 0, w, h, vertical, tickLen),
  );

  const step = (c.step ?? (c.max - c.min) / 100) * (c.invert ? -1 : 1);
  return (
    <ControlFrame
      label={c.label}
      value={c.showValue ? formatValue(display, { unit: c.unit }) : undefined}
      badge={fine ? fineBadge(fineFactor) : undefined}
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
            pos.value = toPos(next);
            setDisplay(next);
            onChange(next);
          }}
        >
          {w > 0 && (
            <Canvas style={{ width: w, height: h }}>
              <RoundedRect x={0} y={0} width={w} height={h} r={r} color={t.control.track} />
              <Group clip={rrect(rect(0, 0, w, h), r, r)}>
                {/* Neon glow of the lit value: full while touched, softer at rest. */}
                <Rect
                  x={fillX}
                  y={fillY}
                  width={fillW}
                  height={fillH}
                  color={t.control.fill}
                  opacity={glow}
                >
                  <BlurMask blur={GLOW_BLUR} style="outer" />
                </Rect>
                <Rect x={fillX} y={fillY} width={fillW} height={fillH} color={t.control.fill} />
                <Path
                  path={ticks}
                  color={t.control.tick}
                  style="stroke"
                  strokeWidth={t.stroke.hairline}
                  opacity={0.9}
                />
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
              {crossfade && (
                // Centre detent mark.
                <Rect
                  x={vertical ? 0 : w / 2 - t.stroke.hairline / 2}
                  y={vertical ? h / 2 - t.stroke.hairline / 2 : 0}
                  width={vertical ? w : t.stroke.hairline}
                  height={vertical ? t.stroke.hairline : h}
                  color={t.control.tick}
                />
              )}
            </Canvas>
          )}
        </View>
      </GestureDetector>
      {crossfade && <CrossfadeLabels control={c} mix={valueToPosition(display, range)} />}
    </ControlFrame>
  );
}

/** A and B names with how much of each is in the mix. */
function CrossfadeLabels({
  control: c,
  mix,
}: {
  control: ControlProps<"fader">["control"];
  mix: number;
}) {
  const s = crossfadeShares(mix);
  return (
    <View className="mt-1 flex-row justify-between">
      <Text className="text-muted-foreground font-mono text-xs" numberOfLines={1}>
        {c.labels?.a ?? "A"} {s.a}%
      </Text>
      <Text className="text-muted-foreground font-mono text-xs" numberOfLines={1}>
        {s.b}% {c.labels?.b ?? "B"}
      </Text>
    </View>
  );
}
