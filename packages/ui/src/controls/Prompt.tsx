import {
  dragShift,
  dragTargetIndex,
  isPromptValue,
  movePreset,
  presetCardState,
  presetsPatternState,
  promptValue,
  tapPreset,
  useInMix,
  type PresetCardState,
  type PromptValue,
} from "@osc/controls";
import type { PromptPresetDto } from "@osc/protocol";
import { Control, type ControlOf } from "@osc/schema";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Button } from "@osc/ui/components/ui/button";
import { Input } from "@osc/ui/components/ui/input";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { useControlServices } from "../platform/services";
import { useControlMeta } from "../pult/context";
import { ContextMenu, type MenuAction } from "./ContextMenu";
import { ControlFrame } from "./ControlFrame";
import { Led } from "./discrete";
import { Fader } from "./Fader";
import type { ControlProps } from "./types";

/** How long the Undo toast stays after a delete (the bridge keeps the preset restorable longer). */
const UNDO_TOAST_MS = 5000;
/** Card width and gap (`w-40`, `gap-2`): one drag slot. */
const CARD_W = 160;
const CARD_GAP = 8;
const SLOT = CARD_W + CARD_GAP;

const CARD: Record<PresetCardState, string> = {
  off: "border-border bg-card",
  on: "border-primary bg-primary",
  inBlend: "border-accent bg-card",
  disabled: "border-border bg-card opacity-40",
  applying: "border-status-warning bg-card",
  error: "border-status-critical bg-card",
  editing: "border-border border-dashed bg-card",
};

const PATTERN_HINT = {
  active: null,
  applying: "Applying…",
  allOff: "All off · base look",
  editing: "Drag to reorder",
  empty: "No prompts yet — add one below",
  error: "The installation didn't confirm · tap the card to retry",
} as const;

type Sheet = { kind: "edit"; preset: PromptPresetDto; text: string; label: string };

/**
 * Prompt (ADR-015, states in ADR-016). Card states: Off, On, In blend, Disabled, Applying (amber,
 * waiting for the installation), Error (not confirmed; tap retries), Editing.
 * - Long-press a card: the system context menu (ADR-013) — On/Off, Edit, Use in mix, Duplicate,
 *   Delete (destructive, last).
 * - Delete is immediate (no confirmation: it can be undone) with an Undo toast for 5 s; the bridge
 *   keeps the preset restorable (soft delete, ADR-016).
 * - Edit mode: drag a card by its grip to reorder (persisted on the bridge); "−" deletes.
 * All logic is in @osc/controls; presets live on the bridge (`useControlServices().prompts`).
 */
export function PromptControl({ control: c, value, onChange, disabled }: ControlProps<"prompt">) {
  const { prompts, pult } = useControlServices();
  const { ack, rev } = useControlMeta(c.id);
  const [presets, setPresets] = React.useState<PromptPresetDto[]>([]);
  const [editing, setEditing] = React.useState(false);
  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const [toast, setToast] = React.useState<PromptPresetDto | null>(null);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const current: PromptValue = isPromptValue(value)
    ? value
    : { a: null, b: null, mix: c.default, aId: null, bId: null };

  const refresh = React.useCallback(
    () => prompts.list(pult, c.id).then(setPresets, (e: Error) => setError(e.message)),
    [prompts, pult, c.id, rev], // eslint-disable-line react-hooks/exhaustive-deps
  );
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), UNDO_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const emit = (
    list: readonly PromptPresetDto[],
    sel: { a: string | null; b: string | null; mix: number },
  ) => onChange(promptValue(list, sel, c.maxLength));
  /** Without a bridge nobody re-sends a live preset that changed; do it here. */
  const reapplyLocally = (list: PromptPresetDto[], changedId: string) => {
    if (prompts.remote || (current.aId !== changedId && current.bId !== changedId)) return;
    emit(list, { a: current.aId ?? null, b: current.bId ?? null, mix: current.mix });
  };

  const tap = (p: PromptPresetDto, state: PresetCardState) => {
    const next = tapPreset(p.id, current, state);
    if (next.retry) onChange(current);
    else emit(presets, next);
  };
  const del = (p: PromptPresetDto) =>
    run(async () => {
      setSheet(null);
      // Immediate: it can be undone (HIG: no confirmation for undoable actions).
      const list = presets.filter((x) => x.id !== p.id);
      setPresets(list);
      setToast(p);
      await prompts.remove(p.id);
      reapplyLocally(list, p.id);
    });
  const undo = (p: PromptPresetDto) =>
    run(async () => {
      setToast(null);
      await prompts.restore(p.id);
      await refresh();
    });
  const duplicate = (p: PromptPresetDto) =>
    run(async () => {
      await prompts.duplicate(p.id);
      await refresh();
    });
  const moveTo = (id: string, to: number) =>
    run(async () => {
      const ids = movePreset(
        presets.map((x) => x.id),
        id,
        to,
      );
      if (ids.join() === presets.map((x) => x.id).join()) return;
      setPresets(ids.map((i) => presets.find((x) => x.id === i)!));
      await prompts.reorder(pult, c.id, ids);
    });
  const saveEdit = (s: Sheet) =>
    run(async () => {
      const updated = await prompts.update(s.preset.id, {
        text: s.text,
        label: s.label.trim() || s.text.slice(0, 24) || s.preset.label,
      });
      const list = presets.map((x) => (x.id === updated.id ? updated : x));
      setPresets(list);
      reapplyLocally(list, updated.id);
      setSheet(null);
    });
  const save = () =>
    run(async () => {
      const text = draft.trim();
      if (!text) return;
      await prompts.create(pult, c.id, { label: text.slice(0, 24), text });
      setDraft("");
      await refresh();
    });

  const menuFor = (p: PromptPresetDto): MenuAction[] => {
    const state = presetCardState({ id: p.id, value: current });
    const on = state !== "off";
    return [
      {
        key: "toggle",
        title: on ? "Off" : "On",
        icon: on ? "lightswitch.off" : "lightswitch.on",
        onSelect: () => tap(p, state),
      },
      {
        key: "edit",
        title: "Edit",
        icon: "pencil",
        onSelect: () => setSheet({ kind: "edit", preset: p, text: p.text, label: p.label }),
      },
      ...(c.blend
        ? [
            {
              key: "mix",
              title: "Use in mix",
              icon: "circle.lefthalf.filled",
              onSelect: () => emit(presets, useInMix(p.id, current)),
            },
          ]
        : []),
      {
        key: "duplicate",
        title: "Duplicate",
        icon: "plus.square.on.square",
        onSelect: () => duplicate(p),
      },
      { key: "delete", title: "Delete", icon: "trash", destructive: true, onSelect: () => del(p) },
    ];
  };

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

  // Drag to reorder (edit mode): which card is lifted and how far it moved.
  const dragFrom = useSharedValue(-1);
  const dragX = useSharedValue(0);

  const pattern = presetsPatternState({ count: presets.length, value: current, ack, editing });
  const hint = PATTERN_HINT[pattern];
  return (
    <ControlFrame label={c.label} value={hint ?? undefined} disabled={disabled}>
      <View className="flex-1 gap-2">
        <View className="flex-row items-center justify-end gap-2">
          {presets.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onPress={() => setEditing((e) => !e)}
              accessibilityLabel={editing ? "Done editing prompts" : "Edit prompts"}
            >
              <Text>{editing ? "Done" : "Edit"}</Text>
            </Button>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
          <View className="flex-row" style={{ gap: CARD_GAP }}>
            {presets.map((p, i) => {
              const state = presetCardState({ id: p.id, value: current, ack, editing, disabled });
              const lit = state === "on";
              const body = (
                <Pressable
                  disabled={disabled || editing}
                  onPress={() => tap(p, state)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: lit, disabled: !!disabled }}
                  accessibilityLabel={`${p.label}, ${state}`}
                  accessibilityHint="Tap to switch on or off. Long-press for more."
                  className="min-h-touch gap-1"
                  testID={`prompt-card-${i}`}
                >
                  <View className="flex-row items-center gap-2">
                    <Led
                      on={state !== "off" && state !== "disabled" && state !== "editing"}
                      className={cn(
                        lit && "bg-primary-foreground",
                        state === "applying" && "bg-status-warning",
                        state === "error" && "bg-status-critical",
                      )}
                    />
                    <Text
                      className={cn(
                        "flex-1 text-xs font-medium",
                        lit ? "text-primary-foreground" : "text-foreground",
                      )}
                      numberOfLines={1}
                    >
                      {p.label}
                    </Text>
                  </View>
                  <Text
                    className={cn(
                      "text-xs",
                      lit ? "text-primary-foreground/80" : "text-muted-foreground",
                      state === "applying" && "text-status-warning",
                      state === "error" && "text-status-critical",
                    )}
                    numberOfLines={2}
                  >
                    {state === "applying"
                      ? "Applying…"
                      : state === "error"
                        ? "Not confirmed · tap to retry"
                        : state === "inBlend"
                          ? `In blend · ${current.aId === p.id ? "A" : "B"}`
                          : p.text}
                  </Text>
                </Pressable>
              );
              return (
                <DraggableCard
                  key={p.id}
                  index={i}
                  count={presets.length}
                  editing={editing}
                  from={dragFrom}
                  dx={dragX}
                  className={CARD[state]}
                  label={p.label}
                  onDrop={(to) => moveTo(p.id, to)}
                  onDelete={() => del(p)}
                >
                  {editing ? (
                    body
                  ) : (
                    <ContextMenu title={p.text} actions={menuFor(p)} disabled={disabled}>
                      {body}
                    </ContextMenu>
                  )}
                </DraggableCard>
              );
            })}
          </View>
        </ScrollView>
        {c.blend && (
          <View className="min-h-16 flex-1">
            <Fader
              control={mixControl}
              value={current.mix}
              onChange={(v) =>
                typeof v === "number" &&
                emit(presets, { a: current.aId ?? null, b: current.bId ?? null, mix: v })
              }
              disabled={disabled}
            />
          </View>
        )}
        {!editing && (
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
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || !draft.trim()}
              onPress={save}
            >
              <Text>Save</Text>
            </Button>
          </View>
        )}
        {error && (
          <Text className="text-status-critical text-xs" numberOfLines={1}>
            {error}
          </Text>
        )}
      </View>

      {sheet && (
        <View className="bg-background/90 absolute inset-0 justify-end rounded-md p-2">
          <View className="bg-card border-border gap-2 rounded-md border p-3">
            <Input
              value={sheet.label}
              onChangeText={(label) => setSheet({ ...sheet, label })}
              maxLength={64}
              placeholder="Name"
              accessibilityLabel="Prompt name"
            />
            <Input
              value={sheet.text}
              onChangeText={(text) => setSheet({ ...sheet, text })}
              maxLength={c.maxLength}
              multiline
              placeholder="Prompt"
              accessibilityLabel="Prompt text"
            />
            <View className="flex-row gap-2">
              <Button size="sm" variant="ghost" className="flex-1" onPress={() => setSheet(null)}>
                <Text>Cancel</Text>
              </Button>
              <Button size="sm" className="flex-1" onPress={() => saveEdit(sheet)}>
                <Text>Save</Text>
              </Button>
            </View>
          </View>
        </View>
      )}

      {toast && (
        // TODO(ds): replace with @osc/ui <Toast> from feat/ds-components-storybook.
        <View
          className="bg-popover border-border absolute bottom-2 left-2 right-2 flex-row items-center justify-between rounded-lg border px-3 py-2"
          accessibilityLiveRegion="polite"
          testID="undo-toast"
        >
          <Text className="text-foreground flex-1 text-xs" numberOfLines={1}>
            Deleted “{toast.label}”
          </Text>
          <Button size="sm" variant="ghost" onPress={() => undo(toast)}>
            <Text className="text-brand-accent">Undo</Text>
          </Button>
        </View>
      )}
    </ControlFrame>
  );
}

/**
 * A preset card. In edit mode it can be dragged by its grip (the others slide to make room) and
 * deleted with "−"; screen readers get Move left / Move right actions instead of the drag.
 */
function DraggableCard({
  index,
  count,
  editing,
  from,
  dx,
  className,
  label,
  onDrop,
  onDelete,
  children,
}: {
  index: number;
  count: number;
  editing: boolean;
  from: SharedValue<number>;
  dx: SharedValue<number>;
  className: string;
  label: string;
  onDrop: (to: number) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const f = from.value;
    if (f < 0) return { transform: [{ translateX: 0 }, { scale: 1 }], zIndex: 0, opacity: 1 };
    if (f === index)
      return { transform: [{ translateX: dx.value }, { scale: 1.04 }], zIndex: 10, opacity: 0.95 };
    const to = dragTargetIndex(f, dx.value, SLOT, count);
    return {
      transform: [
        { translateX: withTiming(dragShift(index, f, to) * SLOT, { duration: 150 }) },
        { scale: 1 },
      ],
      zIndex: 0,
      opacity: 1,
    };
  });
  const drop = React.useCallback(
    (to: number) => {
      onDrop(to);
    },
    [onDrop],
  );
  const pan = usePanGesture({
    enabled: editing && count > 1,
    minDistance: 2,
    onActivate: () => {
      "worklet";
      from.value = index;
      dx.value = 0;
    },
    onUpdate: (e) => {
      "worklet";
      dx.value = e.translationX;
    },
    onFinalize: () => {
      "worklet";
      if (from.value !== index) return;
      const to = dragTargetIndex(index, dx.value, SLOT, count);
      from.value = -1;
      dx.value = 0;
      if (to !== index) scheduleOnRN(drop, to);
    },
  });
  return (
    <Animated.View
      style={[{ width: CARD_W }, style]}
      className={cn("gap-1 rounded-md border p-2", className)}
      accessibilityActions={
        editing
          ? [
              { name: "moveLeft", label: "Move left" },
              { name: "moveRight", label: "Move right" },
            ]
          : undefined
      }
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "moveLeft" && index > 0) onDrop(index - 1);
        if (e.nativeEvent.actionName === "moveRight" && index < count - 1) onDrop(index + 1);
      }}
    >
      {children}
      {editing && (
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${label}`}
            className="bg-muted min-h-8 w-10 items-center justify-center rounded-sm"
          >
            <Text className="text-status-critical text-base">−</Text>
          </Pressable>
          <GestureDetector gesture={pan}>
            <View
              className="bg-muted min-h-8 flex-1 items-center justify-center rounded-sm"
              accessibilityLabel={`Drag ${label} to reorder`}
              testID={`prompt-grip-${index}`}
              // Web: show the grab cursor; native ignores it.
              style={{ cursor: "grab" } as object}
            >
              <Text className="text-muted-foreground text-sm tracking-widest">⋮⋮</Text>
            </View>
          </GestureDetector>
        </View>
      )}
    </Animated.View>
  );
}
