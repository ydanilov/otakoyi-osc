import {
  PREVIEW_BLOBS,
  previewBlobs,
  previewCaption,
  previewRate,
  strobeOn,
  type PreviewParams,
  type Simulator,
} from "@osc/sim";
import { useTheme } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import { BlurMask, Canvas, Circle, Group, Rect } from "@shopify/react-native-skia";
import * as React from "react";
import { View } from "react-native";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * The demo installation's "screen" (ADR-012): a small generative picture whose brightness, hue
 * and speed follow the demo controls, so a reviewer sees the controls do something. Driven by the
 * simulator's preview model; drawn with Skia on the UI thread.
 */
export function PreviewPanel({ sim }: { sim: Simulator }) {
  const t = useTheme();
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [params, setParams] = React.useState<PreviewParams>(() => sim.preview());
  const p = useSharedValue<PreviewParams>(sim.preview());
  const phase = useSharedValue(0);
  const time = useSharedValue(0);
  const flash = useSharedValue(0);
  const fadeIn = useSharedValue(1);

  React.useEffect(
    () =>
      sim.onPreview(() => {
        const next = sim.preview();
        const prev = p.value;
        if (next.flash !== prev.flash)
          flash.value = withSequence(
            withTiming(0.85, { duration: 60 }),
            withTiming(0, { duration: 420 }),
          );
        if (next.restarts !== prev.restarts)
          fadeIn.value = withSequence(
            withTiming(0, { duration: 80 }),
            withTiming(1, { duration: 900 }),
          );
        p.value = next;
        setParams(next);
      }),
    [sim, p, flash, fadeIn],
  );

  useFrameCallback((f) => {
    "worklet";
    const dt = Math.min(0.1, (f.timeSincePreviousFrame ?? 16) / 1000);
    time.value += dt;
    phase.value += dt * previewRate(p.value);
  });

  const { w, h } = size;
  const scale = Math.max(w, h);
  const strobe = useDerivedValue(() => (strobeOn(p.value, time.value) ? 0.55 : 0));
  return (
    <View
      className="bg-background border-border overflow-hidden rounded-xl border"
      style={{ flex: 1 }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessible
      accessibilityLabel={`Preview of the installation: ${previewCaption(params)}`}
      testID="demo-preview"
    >
      {w > 0 && (
        <Canvas style={{ width: w, height: h }}>
          <Rect x={0} y={0} width={w} height={h} color={t.control.track} />
          <Group opacity={fadeIn}>
            {Array.from({ length: PREVIEW_BLOBS }, (_, i) => (
              <Blob key={i} i={i} p={p} phase={phase} w={w} h={h} scale={scale} />
            ))}
          </Group>
          <Rect x={0} y={0} width={w} height={h} color={t.color.text} opacity={strobe} />
          <Rect x={0} y={0} width={w} height={h} color={t.color.text} opacity={flash} />
        </Canvas>
      )}
      <View className="absolute left-3 top-2.5 flex-row items-center gap-1.5" pointerEvents="none">
        <View className="bg-status-online h-1.5 w-1.5 rounded-full" />
        <Text className="text-foreground/80 text-[11px] font-medium uppercase tracking-wider">
          Preview
        </Text>
      </View>
      <Text
        className="text-foreground/80 absolute bottom-2.5 left-3 right-3 text-xs"
        numberOfLines={1}
        pointerEvents="none"
      >
        {previewCaption(params)}
      </Text>
    </View>
  );
}

function Blob({
  i,
  p,
  phase,
  w,
  h,
  scale,
}: {
  i: number;
  p: SharedValue<PreviewParams>;
  phase: SharedValue<number>;
  w: number;
  h: number;
  scale: number;
}) {
  const blob = useDerivedValue(() => previewBlobs(p.value, phase.value)[i]!);
  const cx = useDerivedValue(() => blob.value.x * w);
  const cy = useDerivedValue(() => blob.value.y * h);
  const r = useDerivedValue(() => blob.value.r * scale * 0.5);
  const color = useDerivedValue(() => blob.value.color);
  return (
    <Circle cx={cx} cy={cy} r={r} color={color}>
      <BlurMask blur={scale * 0.08} style="normal" />
    </Circle>
  );
}
