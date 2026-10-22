import { Canvas, Path, RoundedRect, Skia } from "@shopify/react-native-skia";
import {
  createThrottle,
  crossfadeMix,
  crossfadePosition,
  FINE_POINTERS,
  crossfadeShares,
  fineBadge,
  formatValue,
  positionToValue,
  relativeDrag,
  resetValue,
  spreadTicks,
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
import { InsetRRect, LitCircle, LitRRect, RaisedRRect } from "./skia";
import { animateGlow, useFineSpread, useGlow } from "./states";
import { ControlFrame } from "./ControlFrame";
import { JogFader } from "./Jog";
import { TouchLightSkia, useTouchLight, useTouchLightSkia } from "./TouchLight";
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
  const light = useTouchLight({ disabled: !!disabled });

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
      light.down(e.x, e.y);
      if (!absolute) return;
      dragging.value = true;
      const p = vertical ? 1 - e.y / h : e.x / w;
      pos.value = Math.min(1, Math.max(0, p));
      scheduleOnRN(report, pos.value, false);
    },
    onActivate: (e) => {
      "worklet";
      dragging.value = true;
      if (absolute) return;
      drag.value = startDrag(pos.value, e.numberOfPointers);
      // Both fingers landed together: fine mode from the start.
      if (e.numberOfPointers >= FINE_POINTERS) scheduleOnRN(setFine, true);
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
      light.up();
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

  // Geometry (Figma Fader): a recessed rail, a thin lit value line from the start (or the centre)
  // to the thumb, a raised thumb (cap) with an LED and grip lines, ticks beside the rail.
  const center = c.centered || crossfade ? 0.5 : 0;
  const along = vertical ? h : w;
  const across = vertical ? w : h;
  const capLong = Math.min(t.size.faderCapLong, Math.max(24, across - 4));
  const capShort = t.size.faderCapShort;
  // The thumb's centre travels between half a thumb from each end.
  const pad = (vertical ? capShort : t.size.faderCapShort - 4) / 2;
  const travel = Math.max(1, along - pad * 2);
  const mid = across / 2;
  const rail = t.size.faderRail;
  const line = t.size.faderLine;
  /** Pixel along the track (top→bottom for vertical, left→right for horizontal) of a position. */
  const at = (p: number) => {
    "worklet";
    return vertical ? pad + (1 - p) * travel : pad + p * travel;
  };
  const thumbC = useDerivedValue(() => at(pos.value));
  const fillA = useDerivedValue(() => Math.min(at(center), thumbC.value));
  const fillLen = useDerivedValue(() => Math.abs(thumbC.value - at(center)));
  const lineX = vertical ? mid - line / 2 : fillA;
  const lineY = vertical ? fillA : mid - line / 2;
  const lineW = vertical ? line : fillLen;
  const lineH = vertical ? fillLen : line;
  const thumbW = vertical ? capLong : capShort - 4;
  const thumbH = vertical ? capShort : capLong - 12;
  const thumbX = useDerivedValue(() => (vertical ? mid - thumbW / 2 : thumbC.value - thumbW / 2));
  const thumbY = useDerivedValue(() => (vertical ? thumbC.value - thumbH / 2 : mid - thumbH / 2));
  // Touch light: centred on the thumb (it follows the thumb, which follows the finger).
  const lightX = useDerivedValue(() => (vertical ? mid : thumbC.value));
  const lightY = useDerivedValue(() => (vertical ? thumbC.value : mid));
  const lightProps = useTouchLightSkia(light, lightX, lightY, "fader");
  // LED across the thumb, 10 pt before its centre; three grip lines after it.
  const ledLen = Math.round((vertical ? thumbW : thumbH) * 0.6);
  const gripLen = Math.round((vertical ? thumbW : thumbH) * 0.48);
  const ledX = useDerivedValue(() => (vertical ? mid - ledLen / 2 : thumbC.value - 12));
  const ledY = useDerivedValue(() => (vertical ? thumbC.value - 12 : mid - ledLen / 2));
  const grips = useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    for (const o of [2, 7, 12]) {
      const p = thumbC.value + o;
      if (vertical) b.moveTo(mid - gripLen / 2, p).lineTo(mid + gripLen / 2, p);
      else b.moveTo(p, mid - gripLen / 2).lineTo(p, mid + gripLen / 2);
    }
    return b.build();
  });
  // Ticks every 10 % beside the rail (left of a vertical fader, under a crossfade); every 5th is
  // long. Fine mode spreads them ×1.8 around the thumb.
  const showTicks = vertical || crossfade;
  const ticks = useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    if (!showTicks) return b.build();
    const ps = spreadTicks(11, pos.value, spread.value, 0);
    for (const p of ps) {
      const k = Math.round(p * 10);
      const major = Math.abs(p * 10 - k) < 0.02 && k % 5 === 0;
      const q = at(p);
      if (vertical) {
        const x1 = mid - 12;
        b.moveTo(x1 - (major ? 14 : 8), q).lineTo(x1, q);
      } else {
        const y1 = mid + rail / 2 + 8;
        b.moveTo(q, y1).lineTo(q, y1 + (major ? 6 : 4));
      }
    }
    return b.build();
  });
  const lit = fine ? t.color.accent : t.control.fill;
  const isLit = Math.abs(valueToPosition(display, range) - center) > 0.001 || crossfade;

  const step = (c.step ?? (c.max - c.min) / 100) * (c.invert ? -1 : 1);
  return (
    <ControlFrame
      label={c.label}
      align={vertical ? "center" : "split"}
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
              {/* Rail: recessed, full length. */}
              <InsetRRect
                t={t}
                color={t.control.track}
                x={vertical ? mid - rail / 2 : 0}
                y={vertical ? 0 : mid - rail / 2}
                width={vertical ? rail : w}
                height={vertical ? h : rail}
                r={rail / 2}
              />
              {crossfade && (
                <>
                  {/* A / B end LEDs and the centre detent. */}
                  <LitCircle cx={4} cy={mid} r={4} color={lit} glow={glow} />
                  <LitCircle cx={w - 4} cy={mid} r={4} color={lit} glow={glow} />
                  <LitRRect
                    x={at(0.5) - 1}
                    y={mid - 6}
                    width={2}
                    height={12}
                    r={1}
                    color={lit}
                    glow={glow}
                  />
                </>
              )}
              <Path
                path={ticks}
                color={t.control.tick}
                style="stroke"
                strokeWidth={t.stroke.default}
                strokeCap="round"
              />
              {/* The lit value line: full glow while touched, ~40 % at rest. */}
              <LitRRect
                x={lineX}
                y={lineY}
                width={lineW}
                height={lineH}
                r={line / 2}
                color={lit}
                glow={glow}
              />
              {/* Raised thumb (cap) with its LED and grips. */}
              <RaisedRRect
                t={t}
                sm
                color={t.color.surfaceRaised}
                x={thumbX}
                y={thumbY}
                width={thumbW}
                height={thumbH}
                r={t.radius.sm}
              />
              {/* Touch light: above the thumb, below its LED and grips. */}
              <TouchLightSkia {...lightProps} />
              {fine && (
                <RoundedRect
                  x={thumbX}
                  y={thumbY}
                  width={thumbW}
                  height={thumbH}
                  r={t.radius.sm}
                  color={t.color.focus}
                  style="stroke"
                  strokeWidth={t.stroke.default}
                />
              )}
              {isLit ? (
                <LitRRect
                  x={ledX}
                  y={ledY}
                  width={vertical ? ledLen : line}
                  height={vertical ? line : ledLen}
                  r={line / 2}
                  color={lit}
                  glow={glow}
                />
              ) : (
                <RoundedRect
                  x={ledX}
                  y={ledY}
                  width={vertical ? ledLen : line}
                  height={vertical ? line : ledLen}
                  r={line / 2}
                  color={t.control.tick}
                />
              )}
              <Path
                path={grips}
                color={t.control.track}
                style="stroke"
                strokeWidth={t.stroke.default}
                strokeCap="round"
              />
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
