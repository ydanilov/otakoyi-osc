import { Canvas, Circle, Line, vec } from "@shopify/react-native-skia";
import {
  createThumbstick,
  formatValue,
  thumbstickDeflection,
  type Deflection,
  type LitShape,
} from "@osc/controls";
import * as React from "react";
import { View } from "react-native";
import {
  GestureDetector,
  usePanGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "../theme/ThemeProvider";
import { ControlFrame } from "./ControlFrame";
import type { ControlProps } from "./types";
import { InnerLight, useInnerLight, useTouchLight } from "./TouchLight";
import { useLayout } from "./useLayout";

/**
 * Thumbstick (ADR-015): relative 2-D joystick. While held it sends the deflection at `rateHz`
 * (the repeater lives in @osc/controls), springs back to the centre on release and sends 0, 0.
 * A tap sends the optional `press` click.
 */
export function Thumbstick({ control: c, value, onChange, disabled }: ControlProps<"thumbstick">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const { width: w, height: h } = size;
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const [display, setDisplay] = React.useState<Deflection>({ x: 0, y: 0 });
  const held = React.useRef(false);

  // Another device moving the stick (synced through the bridge): follow it while not held here.
  React.useEffect(() => {
    if (held.current || typeof value !== "object" || value === null) return;
    if (!("x" in value) || typeof value.x !== "number" || typeof value.y !== "number") return;
    dx.value = value.x;
    dy.value = value.y;
    setDisplay({ x: value.x, y: value.y });
  }, [value, dx, dy]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const stick = React.useMemo(
    () => createThumbstick({ rateHz: c.rateHz }, (d) => onChangeRef.current(d)),
    [c.rateHz],
  );
  React.useEffect(() => () => stick.dispose(), [stick]);

  const start = React.useCallback(
    (d: Deflection) => {
      held.current = true;
      setDisplay(d);
      stick.start(d);
    },
    [stick],
  );
  const move = React.useCallback(
    (d: Deflection) => {
      setDisplay(d);
      stick.move(d);
    },
    [stick],
  );
  const release = React.useCallback(() => {
    held.current = false;
    setDisplay({ x: 0, y: 0 });
    stick.release();
  }, [stick]);
  const click = React.useCallback(() => {
    onChangeRef.current({ pressed: true });
    onChangeRef.current({ pressed: false });
  }, []);

  const deadzone = c.deadzone;
  const light = useTouchLight({ disabled: !!disabled });
  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 2,
    shouldCancelWhenOutside: false,
    onBegin: (e) => {
      "worklet";
      light.down(e.x, e.y);
    },
    onActivate: (e) => {
      "worklet";
      const d = thumbstickDeflection({ x: e.x, y: e.y }, { width: w, height: h }, deadzone);
      dx.value = d.x;
      dy.value = d.y;
      scheduleOnRN(start, d);
    },
    onUpdate: (e) => {
      "worklet";
      light.move(e.x, e.y);
      const d = thumbstickDeflection({ x: e.x, y: e.y }, { width: w, height: h }, deadzone);
      dx.value = d.x;
      dy.value = d.y;
      scheduleOnRN(move, d);
    },
    onFinalize: () => {
      "worklet";
      light.up();
      dx.value = withSpring(0);
      dy.value = withSpring(0);
      scheduleOnRN(release);
    },
  });
  const tap = useTapGesture({
    enabled: !disabled && !!c.press,
    onActivate: () => {
      "worklet";
      scheduleOnRN(click);
    },
  });
  const gesture = useSimultaneousGestures(pan, tap);

  const reach = Math.min(w, h) / 2 - t.size.xyDot / 2;
  const cx = w / 2;
  const cy = h / 2;
  const capX = useDerivedValue(() => cx + dx.value * reach);
  const capY = useDerivedValue(() => cy - dy.value * reach);
  const stem = useDerivedValue(() => vec(capX.value, capY.value));
  // Touch light: on the stick (it follows the finger within its reach).
  const stickShape = useDerivedValue<LitShape>(() => ({
    kind: "circle",
    cx: capX.value,
    cy: capY.value,
    r: t.size.xyDot / 2,
  }));
  const lightProps = useInnerLight(light, stickShape);
  return (
    <ControlFrame
      label={c.label}
      value={`${formatValue(display.x, { decimals: 2 })}, ${formatValue(display.y, { decimals: 2 })}`}
      disabled={disabled}
    >
      <GestureDetector gesture={gesture}>
        <View
          className="flex-1"
          onLayout={onLayout}
          accessible
          accessibilityLabel={c.label ?? c.id}
          accessibilityHint="Joystick. Hold and push to move; let go to stop."
        >
          {w > 0 && (
            <Canvas style={{ width: w, height: h }}>
              <Circle cx={cx} cy={cy} r={reach + t.size.xyDot / 2} color={t.control.track} />
              <Circle
                cx={cx}
                cy={cy}
                r={reach * c.deadzone + 1}
                color={t.control.tick}
                style="stroke"
                strokeWidth={t.stroke.hairline}
              />
              <Line
                p1={vec(cx, cy)}
                p2={stem}
                color={t.control.fill}
                strokeWidth={t.stroke.strong}
              />
              <Circle cx={capX} cy={capY} r={t.size.xyDot / 2} color={t.color.surfaceRaised} />
              {/* Touch light: above the stick, below its ring. */}
              <InnerLight {...lightProps} />
              <Circle
                cx={capX}
                cy={capY}
                r={t.size.xyDot / 2}
                color={t.control.fill}
                style="stroke"
                strokeWidth={t.stroke.strong}
              />
            </Canvas>
          )}
        </View>
      </GestureDetector>
    </ControlFrame>
  );
}
