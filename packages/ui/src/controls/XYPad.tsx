import {
  Canvas,
  Circle,
  Group,
  Line,
  RoundedRect,
  rect,
  rrect,
  vec,
} from "@shopify/react-native-skia";
import { createThrottle, formatValue } from "@osc/controls";
import * as React from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "../theme/ThemeProvider";
import { ControlFrame } from "./ControlFrame";
import type { ControlProps } from "./types";
import { useLayout } from "./useLayout";

type Point = { x: number; y: number };
const isPoint = (v: unknown): v is Point =>
  typeof v === "object" && v !== null && "x" in v && "y" in v;

/** Two-axis pad. Point is normalised 0..1 with y growing upwards; the schema maps it to each axis range. */
export function XYPad({ control: c, value, onChange, disabled }: ControlProps<"xy">) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const start = isPoint(value) ? value : { x: 0.5, y: 0.5 };
  const px = useSharedValue(start.x);
  const py = useSharedValue(start.y);
  const active = useSharedValue(0);
  const dragging = useSharedValue(false);
  const [display, setDisplay] = React.useState<Point>(start);

  React.useEffect(() => {
    if (dragging.value || !isPoint(value)) return;
    px.value = value.x;
    py.value = value.y;
    setDisplay(value);
  }, [value, px, py, dragging]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const throttle = React.useMemo(
    () => createThrottle<Point>(c.throttleHz, (v) => onChangeRef.current(v)),
    [c.throttleHz],
  );
  React.useEffect(() => () => throttle.cancel(), [throttle]);

  const report = React.useCallback(
    (x: number, y: number, final: boolean) => {
      const p = { x, y };
      setDisplay(p);
      throttle.push(p);
      if (final) throttle.flush();
    },
    [throttle],
  );

  const { width: w, height: h } = size;
  const spring = c.springBack;
  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 0,
    shouldCancelWhenOutside: false,
    onBegin: (e) => {
      "worklet";
      dragging.value = true;
      active.value = 1;
      px.value = Math.min(1, Math.max(0, e.x / w));
      py.value = Math.min(1, Math.max(0, 1 - e.y / h));
      scheduleOnRN(report, px.value, py.value, false);
    },
    onUpdate: (e) => {
      "worklet";
      px.value = Math.min(1, Math.max(0, e.x / w));
      py.value = Math.min(1, Math.max(0, 1 - e.y / h));
      scheduleOnRN(report, px.value, py.value, false);
    },
    onFinalize: () => {
      "worklet";
      dragging.value = false;
      active.value = 0;
      if (spring) {
        px.value = withSpring(0.5);
        py.value = withSpring(0.5);
        scheduleOnRN(report, 0.5, 0.5, true);
      } else scheduleOnRN(report, px.value, py.value, true);
    },
  });

  const dotX = useDerivedValue(() => px.value * w);
  const dotY = useDerivedValue(() => (1 - py.value) * h);
  const vTop = useDerivedValue(() => vec(px.value * w, 0));
  const vBottom = useDerivedValue(() => vec(px.value * w, h));
  const hLeft = useDerivedValue(() => vec(0, (1 - py.value) * h));
  const hRight = useDerivedValue(() => vec(w, (1 - py.value) * h));
  const dotR = useDerivedValue(() => t.size.xyDot / 2 + active.value * 4);
  const r = t.radius.md;

  const axis = (v: number, a: { min: number; max: number }) =>
    formatValue(a.min + v * (a.max - a.min));
  return (
    <ControlFrame
      label={c.label}
      value={`${axis(display.x, c.x)}, ${axis(display.y, c.y)}`}
      disabled={disabled}
    >
      <GestureDetector gesture={pan}>
        <View
          className="flex-1"
          onLayout={onLayout}
          accessible
          accessibilityLabel={c.label ?? c.id}
          accessibilityHint="Two-axis pad"
        >
          {w > 0 && (
            <Canvas style={{ width: w, height: h }}>
              <RoundedRect x={0} y={0} width={w} height={h} r={r} color={t.control.track} />
              <Group clip={rrect(rect(0, 0, w, h), r, r)}>
                <Line
                  p1={vec(w / 2, 0)}
                  p2={vec(w / 2, h)}
                  color={t.control.tick}
                  strokeWidth={1}
                />
                <Line
                  p1={vec(0, h / 2)}
                  p2={vec(w, h / 2)}
                  color={t.control.tick}
                  strokeWidth={1}
                />
                <Line p1={vTop} p2={vBottom} color={t.control.fill} strokeWidth={1} opacity={0.6} />
                <Line p1={hLeft} p2={hRight} color={t.control.fill} strokeWidth={1} opacity={0.6} />
                <Circle cx={dotX} cy={dotY} r={dotR} color={t.control.fill} />
              </Group>
              <RoundedRect
                x={0.5}
                y={0.5}
                width={w - 1}
                height={h - 1}
                r={r}
                color={t.control.trackBorder}
                style="stroke"
                strokeWidth={1}
              />
            </Canvas>
          )}
        </View>
      </GestureDetector>
    </ControlFrame>
  );
}
