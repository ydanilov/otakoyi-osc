import {
  analyzeBlock,
  createBeatDetector,
  isPromptValue,
  promptValue,
  type ControlValue,
  type MicFrame,
} from "@osc/controls";
import type { ImageAssetDto, PromptPresetDto } from "@osc/protocol";
import { Control, type ControlOf } from "@osc/schema";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@osc/ui/components/ui/button";
import { Input } from "@osc/ui/components/ui/input";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { useControlServices } from "../platform/services";
import { ControlFrame } from "./ControlFrame";
import { Led } from "./discrete";
import { Fader } from "./Fader";
import type { ControlProps } from "./types";

const ASPECT: Record<ControlOf<"image">["aspect"], number | undefined> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "9:16": 9 / 16,
  free: undefined,
};

const asImage = (v: ControlValue) =>
  typeof v === "object" && v !== null && "path" in v && "image" in v ? v : null;

/**
 * Image upload (ADR-015): pick a photo → the bridge validates and stores it and sends
 * `<address> <path>`. With `library`, earlier uploads can be shown again with one tap.
 * Picking and uploading go through `useControlServices()` (platform seam, no Platform.OS here).
 */
export function ImageUpload({ control: c, value, onChange, disabled }: ControlProps<"image">) {
  const { imagePicker, media, pult } = useControlServices();
  const [items, setItems] = React.useState<ImageAssetDto[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const current = asImage(value);

  const refresh = React.useCallback(() => {
    if (c.library) media.list(pult, c.id).then(setItems, () => {});
  }, [media, pult, c.id, c.library]);
  React.useEffect(refresh, [refresh]);

  const showLocally = (a: ImageAssetDto) => {
    if (!media.remote) onChange({ image: a.id, path: a.path });
  };
  const pick = async () => {
    setError(null);
    const img = await imagePicker.pick({ aspect: c.aspect, formats: c.formats });
    if (!img) return;
    setBusy(true);
    try {
      showLocally(await media.upload(pult, c.id, img));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const show = async (a: ImageAssetDto) => {
    setError(null);
    try {
      showLocally(media.remote ? await media.show(a.id) : a);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const name = current
    ? (items.find((i) => i.id === current.image)?.name ?? current.path.split(/[\\/]/).pop())
    : null;
  return (
    <ControlFrame label={c.label} value={name ?? undefined} disabled={disabled}>
      <View className="flex-1 gap-2">
        <Pressable
          disabled={disabled || busy || !imagePicker.available}
          onPress={pick}
          accessibilityRole="button"
          accessibilityLabel={`${c.label ?? c.id}: choose a photo`}
          style={ASPECT[c.aspect] ? { aspectRatio: ASPECT[c.aspect] } : undefined}
          className={cn(
            "bg-control-track border-border min-h-touch max-h-full flex-1 items-center justify-center self-center rounded-md border border-dashed px-3",
            ASPECT[c.aspect] ? "flex-none" : "w-full",
          )}
        >
          <Text className="text-foreground text-sm font-medium">
            {busy ? "Uploading…" : current ? "Replace photo" : "Choose photo"}
          </Text>
          <Text className="text-muted-foreground mt-1 text-center text-xs">
            {imagePicker.available
              ? `${c.aspect === "free" ? "Any shape" : c.aspect} · ${c.formats.join(", ")} · ≤ ${c.maxMB} MB`
              : "Photo picking isn't available on this device yet"}
          </Text>
        </Pressable>
        {error && (
          <Text className="text-status-critical text-xs" numberOfLines={2}>
            {error}
          </Text>
        )}
        {c.library && items.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
            <View className="flex-row gap-2">
              {items.map((a) => {
                const active = current?.image === a.id;
                return (
                  <Pressable
                    key={a.id}
                    disabled={disabled}
                    onPress={() => show(a)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={cn(
                      "min-h-touch justify-center rounded-md border px-3",
                      active ? "border-primary bg-primary" : "border-border bg-card",
                    )}
                  >
                    <Text
                      className={cn(
                        "max-w-32 text-xs",
                        active ? "text-primary-foreground" : "text-foreground",
                      )}
                      numberOfLines={1}
                    >
                      {a.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </ControlFrame>
  );
}

const asFrame = (v: ControlValue): MicFrame =>
  typeof v === "object" && v !== null && ("level" in v || "bands" in v || "beat" in v)
    ? (v as MicFrame)
    : {};

/**
 * Mic (ADR-015): on-device analysis; audio never leaves the device, only level / bands / beat.
 * Capture is the platform's `AudioInput`; analysis and message shapes are in @osc/controls.
 */
export function MicControl({ control: c, value, onChange, disabled }: ControlProps<"mic">) {
  const { audio } = useControlServices();
  const [listening, setListening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [local, setLocal] = React.useState<MicFrame>({});
  const stop = React.useRef<(() => void) | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  React.useEffect(() => () => stop.current?.(), []);
  React.useEffect(() => {
    if (disabled && stop.current) {
      stop.current();
      stop.current = null;
      setListening(false);
    }
  }, [disabled]);

  const toggle = async () => {
    setError(null);
    if (stop.current) {
      stop.current();
      stop.current = null;
      setListening(false);
      return;
    }
    if (!(await audio.requestPermission())) return setError("Microphone access was not allowed");
    const beat = createBeatDetector();
    try {
      stop.current = await audio.start({ rateHz: c.rateHz, bands: c.bands }, (block) => {
        const frame = analyzeBlock(c, block, beat);
        setLocal(frame);
        onChangeRef.current(frame);
      });
      setListening(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Show this device's analysis while listening, otherwise whatever another device sends.
  const frame = listening ? local : asFrame(value);
  const level = frame.level ?? 0;
  return (
    <ControlFrame
      label={c.label}
      value={listening ? `${Math.round(level * 100)}%` : undefined}
      disabled={disabled}
    >
      <View className="flex-1 flex-row gap-3">
        <Pressable
          disabled={disabled || !audio.available}
          onPress={toggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: listening, disabled: disabled || !audio.available }}
          accessibilityLabel={`${c.label ?? c.id}: listen`}
          className={cn(
            "min-h-touch w-24 items-center justify-center gap-1 rounded-md border px-2",
            listening ? "border-primary bg-primary" : "border-border bg-card",
          )}
        >
          <Led on={listening} className={listening ? "bg-primary-foreground" : undefined} />
          <Text
            className={cn(
              "text-sm font-semibold",
              listening ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {listening ? "Stop" : "Listen"}
          </Text>
        </Pressable>
        <View className="bg-control-track flex-1 flex-row items-end gap-1 rounded-md p-2">
          {c.outputs.includes("level") && (
            <View className="bg-muted h-full w-3 justify-end overflow-hidden rounded-sm">
              <View className="bg-control-fill w-full" style={{ height: `${level * 100}%` }} />
            </View>
          )}
          {c.outputs.includes("bands") &&
            Array.from({ length: c.bands }, (_, i) => (
              <View
                key={i}
                className="bg-control-fill flex-1 rounded-sm"
                style={{ height: `${Math.max(2, (frame.bands?.[i] ?? 0) * 100)}%` }}
              />
            ))}
          {c.outputs.includes("beat") && <Led on={!!frame.beat} className="mb-1 h-3 w-3" />}
        </View>
      </View>
      {(error || !audio.available) && (
        <Text className="text-muted-foreground mt-1 text-xs" numberOfLines={1}>
          {error ?? "The microphone isn't available on this device yet"}
        </Text>
      )}
    </ControlFrame>
  );
}

/**
 * Prompt (ADR-015): client-made presets on the bridge; assign one to A (and B), switch presets on
 * or off, and blend A↔B. The live texts and the mix are the control's value.
 */
export function PromptControl({ control: c, value, onChange, disabled }: ControlProps<"prompt">) {
  const { prompts, pult } = useControlServices();
  const [presets, setPresets] = React.useState<PromptPresetDto[]>([]);
  const [sel, setSel] = React.useState<{ a: string | null; b: string | null }>({
    a: null,
    b: null,
  });
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const current = isPromptValue(value) ? value : { a: null, b: null, mix: c.default };

  const refresh = React.useCallback(
    () => prompts.list(pult, c.id).then(setPresets, (e: Error) => setError(e.message)),
    [prompts, pult, c.id],
  );
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const emit = (list: PromptPresetDto[], s: typeof sel, mix: number) =>
    onChange(promptValue(list, { ...s, mix }, c.maxLength));
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const assign = (slot: "a" | "b", id: string) => {
    const next = { ...sel, [slot]: sel[slot] === id ? null : id };
    setSel(next);
    emit(presets, next, current.mix);
  };
  const toggleOn = (p: PromptPresetDto) =>
    run(async () => {
      const updated = await prompts.update(p.id, { on: !p.on });
      const list = presets.map((x) => (x.id === p.id ? updated : x));
      setPresets(list);
      if (sel.a === p.id || sel.b === p.id) emit(list, sel, current.mix);
    });
  const save = () =>
    run(async () => {
      const text = draft.trim();
      if (!text) return;
      await prompts.create(pult, c.id, { label: text.slice(0, 24), text });
      setDraft("");
      await refresh();
    });

  const mixControl = React.useMemo(
    () =>
      Control.parse({
        id: `${c.id}-mix`,
        type: "fader",
        mode: "crossfade",
        address: `${c.address}/mix`,
        orientation: "horizontal",
        labels: { a: "A", b: "B" },
        default: c.default,
        showValue: false,
        label: "Blend",
      }) as ControlOf<"fader">,
    [c.id, c.address, c.default],
  );

  return (
    <ControlFrame label={c.label} disabled={disabled}>
      <View className="flex-1 gap-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
          <View className="flex-row gap-2">
            {presets.length === 0 && (
              <Text className="text-muted-foreground py-2 text-xs">
                No prompts yet — add one below.
              </Text>
            )}
            {presets.map((p) => (
              <View key={p.id} className="bg-card border-border w-40 gap-1 rounded-md border p-2">
                <Pressable
                  disabled={disabled}
                  onPress={() => toggleOn(p)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: p.on }}
                  accessibilityLabel={`${p.label} on`}
                  className="flex-row items-center gap-2"
                >
                  <Led on={p.on} />
                  <Text className="text-foreground flex-1 text-xs font-medium" numberOfLines={1}>
                    {p.label}
                  </Text>
                </Pressable>
                <View className="flex-row gap-1">
                  {(c.blend ? (["a", "b"] as const) : (["a"] as const)).map((slot) => {
                    const active = sel[slot] === p.id;
                    return (
                      <Pressable
                        key={slot}
                        disabled={disabled}
                        onPress={() => assign(slot, p.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${p.label} to ${slot.toUpperCase()}`}
                        className={cn(
                          "min-h-8 flex-1 items-center justify-center rounded-sm",
                          active ? "bg-primary" : "bg-muted",
                        )}
                      >
                        <Text
                          className={cn(
                            "font-mono text-xs",
                            active ? "text-primary-foreground" : "text-muted-foreground",
                          )}
                        >
                          {c.blend ? slot.toUpperCase() : "Live"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        {c.blend && (
          <View className="min-h-16 flex-1">
            <Fader
              control={mixControl}
              value={current.mix}
              onChange={(v) => typeof v === "number" && emit(presets, sel, v)}
              disabled={disabled}
            />
          </View>
        )}
        <View className="flex-row items-center gap-2">
          <Input
            className="flex-1"
            value={draft}
            onChangeText={setDraft}
            maxLength={c.maxLength}
            placeholder="New prompt…"
            editable={!disabled}
            onSubmitEditing={save}
          />
          <Button size="sm" variant="secondary" disabled={disabled || !draft.trim()} onPress={save}>
            <Text>Save</Text>
          </Button>
        </View>
        {error && (
          <Text className="text-status-critical text-xs" numberOfLines={1}>
            {error}
          </Text>
        )}
      </View>
    </ControlFrame>
  );
}
