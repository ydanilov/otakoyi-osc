import { Canvas, LinearGradient, Path, RoundedRect, Skia, vec } from "@shopify/react-native-skia";
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
import { InsetRRect, LitRRect } from "./skia";
import { animateGlow, useFineSpread, useGlow } from "./states";
import { ControlFrame } from "./ControlFrame";
import type { ControlProps } from "./types";
import { TouchLightSkia, useLightPoint, useTouchLight, useTouchLightSkia } from "./TouchLight";
import { useLayout } from "./useLayout";

/** Angle between two ribs of the wheel (a cylinder seen from the front), degrees. */
const RIB_DEG = 7;
/** Rib opacities from the edge (dark) to the middle (bright) of the wheel — Figma 4 % … 46 %. */
const RIB_LEVELS = [0.05, 0.12, 0.2, 0.3, 0.38, 0.46];

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
  const light = useTouchLight({ disabled: !!disabled });
  const lightAt = useLightPoint(light, w, h);
  const lightProps = useTouchLightSkia(light, lightAt.x, lightAt.y, "fader");

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
    onBegin: (e) => {
      "worklet";
      animateGlow(glow, true);
      light.down(e.x, e.y);
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
      light.move(e.x, e.y);
      scheduleOnRN(push, step, e.numberOfPointers);
    },
    onFinalize: () => {
      "worklet";
      animateGlow(glow, false);
      light.up();
      scheduleOnRN(end);
    },
  });

  // Figma Fader Mode=Relative: a recessed housing with a wheel inside. The wheel's ribs are drawn
  // as a cylinder seen from the front (narrow and dark at the edges, wide and bright in the
  // middle) and roll with the drag; fine mode spreads them ×1.8. Lit detent marks either side of
  // the centre glow (fully while touched).
  const across = vertical ? w : h;
  const mid = across / 2;
  const housing = vertical ? 64 : t.size.jogHousing;
  const inset = 6;
  const wheelAcross = housing - inset * 2;
  const wheelLen = Math.max(0, length - inset * 2);
  const R = wheelLen / 2;
  const levels = useDerivedValue(() => {
    const out: Array<Array<[number, number]>> = RIB_LEVELS.map(() => []);
    if (R <= 0) return out;
    const step = ((RIB_DEG * Math.PI) / 180) * spread.value;
    const phase = (((offset.value / R) % step) + step) % step;
    for (let a = -Math.PI / 2 - step + phase; a < Math.PI / 2 + step; a += step) {
      const a0 = Math.max(-Math.PI / 2, a - step / 2);
      const a1 = Math.min(Math.PI / 2, a + step / 2);
      if (a1 <= a0) continue;
      const p0 = R + Math.sin(a0) * R;
      const p1 = R + Math.sin(a1) * R;
      if (p1 - p0 < 0.6) continue;
      const lit = Math.pow(Math.cos(a), 1.5);
      const i = Math.min(RIB_LEVELS.length - 1, Math.floor(lit * RIB_LEVELS.length));
      out[i]!.push([p0, Math.max(p0 + 0.5, p1 - 1.5)]);
    }
    return out;
  });
  const ribPath = (i: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const b = Skia.PathBuilder.Make();
      const x0 = vertical ? mid - wheelAcross / 2 : inset;
      const y0 = vertical ? inset : mid - wheelAcross / 2;
      for (const [p0, p1] of levels.value[i] ?? []) {
        if (vertical) b.addRect(Skia.XYWHRect(x0, y0 + p0, wheelAcross, p1 - p0));
        else b.addRect(Skia.XYWHRect(x0 + p0, y0, p1 - p0, wheelAcross));
      }
      return b.build();
    });
  const ribs = RIB_LEVELS.map((_, i) => ribPath(i));
  const lit = fine ? t.color.accent : t.control.fill;
  const hx = vertical ? mid - housing / 2 : 0;
  const hy = vertical ? 0 : mid - housing / 2;
  const hw = vertical ? housing : w;
  const hh = vertical ? h : housing;
  const wx = vertical ? mid - wheelAcross / 2 : inset;
  const wy = vertical ? inset : mid - wheelAcross / 2;
  const ww = vertical ? wheelAcross : wheelLen;
  const wh = vertical ? wheelLen : wheelAcross;
  const detent = (side: -1 | 1) =>
    vertical
      ? { x: mid + side * (housing / 2 + 8) - 2, y: h / 2 - 9, width: 4, height: 18 }
      : { x: w / 2 - 9, y: mid + side * (housing / 2 + 8) - 2, width: 18, height: 4 };
  const signs = Skia.PathBuilder.Make();
  {
    // − at the low end, + at the high end, outside the housing.
    const o = housing / 2 + 7;
    const lo = vertical ? { x: mid + o, y: h - 5 } : { x: 5, y: mid + o };
    const hi = vertical ? { x: mid + o, y: 5 } : { x: w - 5, y: mid + o };
    signs.moveTo(lo.x - 5, lo.y).lineTo(lo.x + 5, lo.y);
    signs
      .moveTo(hi.x - 5, hi.y)
      .lineTo(hi.x + 5, hi.y)
      .moveTo(hi.x, hi.y - 5)
      .lineTo(hi.x, hi.y + 5);
  }
  const signPath = signs.build();
  return (
    <ControlFrame
      label={c.label}
      align={vertical ? "center" : "split"}
      value={c.showValue ? formatValue(moved, { unit: c.unit }) : undefined}
      badge={fine ? fineBadge(fineFactor) : undefined}
      relative
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
              <InsetRRect
                t={t}
                color={t.control.track}
                x={hx}
                y={hy}
                width={hw}
                height={hh}
                r={12}
              />
              <InsetRRect
                t={t}
                pressed
                color={t.control.track}
                x={wx}
                y={wy}
                width={ww}
                height={wh}
                r={6}
              />
              {ribs.map((path, i) => (
                <Path key={i} path={path} color={t.color.textMuted} opacity={RIB_LEVELS[i]} />
              ))}
              {/* Cylinder shading towards both ends of the wheel. */}
              <RoundedRect x={wx} y={wy} width={ww} height={wh} r={6}>
                <LinearGradient
                  start={vec(wx, wy)}
                  end={vertical ? vec(wx, wy + wh) : vec(wx + ww, wy)}
                  positions={[0, 0.18, 0.82, 1]}
                  colors={[
                    t.elevation.insetShadow,
                    "transparent",
                    "transparent",
                    t.elevation.insetShadow,
                  ]}
                />
              </RoundedRect>
              {/* Touch light: under the finger, on the wheel, below the detent LEDs. */}
              <TouchLightSkia {...lightProps} />
              {fine && (
                <RoundedRect
                  x={hx + 0.75}
                  y={hy + 0.75}
                  width={hw - 1.5}
                  height={hh - 1.5}
                  r={12}
                  color={t.color.focus}
                  style="stroke"
                  strokeWidth={t.stroke.default}
                />
              )}
              <LitRRect {...detent(-1)} r={2} color={lit} glow={glow} />
              <LitRRect {...detent(1)} r={2} color={lit} glow={glow} />
              <Path
                path={signPath}
                color={t.color.textMuted}
                style="stroke"
                strokeWidth={t.stroke.hairline}
                strokeCap="round"
              />
            </Canvas>
          )}
        </View>
      </GestureDetector>
    </ControlFrame>
  );
}
