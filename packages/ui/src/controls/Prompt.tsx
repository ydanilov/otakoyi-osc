import {
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
import { Button } from "@osc/ui/components/ui/button";
import { Input } from "@osc/ui/components/ui/input";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { useControlServices } from "../platform/services";
import { useControlMeta } from "../pult/context";
import { ControlFrame } from "./ControlFrame";
import { Led } from "./discrete";
import { Fader } from "./Fader";
import type { ControlProps } from "./types";

/** How long the Undo toast stays after a delete (the bridge keeps the preset restorable longer). */
const UNDO_TOAST_MS = 5000;

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
  editing: "Editing",
  empty: "No prompts yet — add one below",
  error: "The installation didn't confirm · tap the card to retry",
} as const;

type Sheet =
  | { kind: "actions"; preset: PromptPresetDto }
  | { kind: "confirmDelete"; preset: PromptPresetDto }
  | { kind: "edit"; preset: PromptPresetDto; text: string; label: string };

/**
 * Prompt (ADR-015, states in ADR-016). Card states: Off, On, In blend, Disabled, Applying (amber,
 * waiting for the installation), Error (not confirmed; tap retries), Editing. Long-press opens the
 * card's actions (On/Off, Edit, Use in mix, Duplicate, Delete). Deletes ask first and can be undone
 * for a few seconds. Edit mode deletes ("−") and reorders. All logic is in @osc/controls; presets
 * live on the bridge (`useControlServices().prompts`).
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
      await prompts.remove(p.id);
      const list = presets.filter((x) => x.id !== p.id);
      setPresets(list);
      reapplyLocally(list, p.id);
      setToast(p);
    });
  const undo = (p: PromptPresetDto) =>
    run(async () => {
      setToast(null);
      await prompts.restore(p.id);
      await refresh();
    });
  const duplicate = (p: PromptPresetDto) =>
    run(async () => {
      setSheet(null);
      await prompts.duplicate(p.id);
      await refresh();
    });
  const move = (p: PromptPresetDto, by: number) =>
    run(async () => {
      const ids = movePreset(
        presets.map((x) => x.id),
        p.id,
        presets.indexOf(p) + by,
      );
      setPresets(ids.map((id) => presets.find((x) => x.id === id)!));
      await prompts.reorder(pult, c.id, ids);
    });
  const saveEdit = (s: Extract<Sheet, { kind: "edit" }>) =>
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
          <View className="flex-row gap-2">
            {presets.map((p, i) => {
              const state = presetCardState({ id: p.id, value: current, ack, editing, disabled });
              const lit = state === "on";
              return (
                <View key={p.id} className={cn("w-40 gap-1 rounded-md border p-2", CARD[state])}>
                  <Pressable
                    disabled={disabled || editing}
                    onPress={() => tap(p, state)}
                    onLongPress={() => setSheet({ kind: "actions", preset: p })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: lit, disabled: !!disabled }}
                    accessibilityLabel={`${p.label}, ${state}`}
                    accessibilityHint="Tap to switch on or off. Long-press for more."
                    className="min-h-touch gap-1"
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
                  {editing && (
                    // TODO(prompt-drag): drag to reorder; ‹ › are the accessible stand-in until then.
                    <View className="flex-row gap-1">
                      <SmallButton
                        label="−"
                        hint={`Delete ${p.label}`}
                        onPress={() => setSheet({ kind: "confirmDelete", preset: p })}
                      />
                      <SmallButton
                        label="‹"
                        hint="Move left"
                        disabled={i === 0}
                        onPress={() => move(p, -1)}
                      />
                      <SmallButton
                        label="›"
                        hint="Move right"
                        disabled={i === presets.length - 1}
                        onPress={() => move(p, 1)}
                      />
                    </View>
                  )}
                </View>
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
            {sheet.kind === "actions" && (
              <>
                <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                  {sheet.preset.label}
                </Text>
                <SheetButton
                  label={
                    presetCardState({ id: sheet.preset.id, value: current }) === "off"
                      ? "On"
                      : "Off"
                  }
                  onPress={() => {
                    tap(sheet.preset, presetCardState({ id: sheet.preset.id, value: current }));
                    setSheet(null);
                  }}
                />
                <SheetButton
                  label="Edit"
                  onPress={() =>
                    setSheet({
                      kind: "edit",
                      preset: sheet.preset,
                      text: sheet.preset.text,
                      label: sheet.preset.label,
                    })
                  }
                />
                {c.blend && (
                  <SheetButton
                    label="Use in mix"
                    onPress={() => {
                      emit(presets, useInMix(sheet.preset.id, current));
                      setSheet(null);
                    }}
                  />
                )}
                <SheetButton label="Duplicate" onPress={() => duplicate(sheet.preset)} />
                <SheetButton
                  label="Delete"
                  destructive
                  onPress={() => setSheet({ kind: "confirmDelete", preset: sheet.preset })}
                />
                <SheetButton label="Cancel" onPress={() => setSheet(null)} />
              </>
            )}
            {sheet.kind === "confirmDelete" && (
              <>
                <Text className="text-foreground text-sm">
                  Delete “{sheet.preset.label}”?
                  {current.aId === sheet.preset.id || current.bId === sheet.preset.id
                    ? " It is live: the installation goes back to its base look."
                    : ""}
                </Text>
                <SheetButton label="Delete" destructive onPress={() => del(sheet.preset)} />
                <SheetButton label="Cancel" onPress={() => setSheet(null)} />
              </>
            )}
            {sheet.kind === "edit" && (
              <>
                <Input
                  value={sheet.label}
                  onChangeText={(label) => setSheet({ ...sheet, label })}
                  maxLength={64}
                  placeholder="Name"
                />
                <Input
                  value={sheet.text}
                  onChangeText={(text) => setSheet({ ...sheet, text })}
                  maxLength={c.maxLength}
                  multiline
                  placeholder="Prompt"
                />
                <View className="flex-row gap-2">
                  <Button size="sm" className="flex-1" onPress={() => saveEdit(sheet)}>
                    <Text>Save</Text>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    onPress={() => setSheet(null)}
                  >
                    <Text>Cancel</Text>
                  </Button>
                </View>
                <SheetButton
                  label="Delete prompt"
                  destructive
                  onPress={() => setSheet({ kind: "confirmDelete", preset: sheet.preset })}
                />
              </>
            )}
          </View>
        </View>
      )}

      {toast && (
        <View className="bg-card border-border absolute bottom-2 left-2 right-2 flex-row items-center justify-between rounded-md border px-3 py-2">
          <Text className="text-foreground flex-1 text-xs" numberOfLines={1}>
            Deleted “{toast.label}”
          </Text>
          <Button size="sm" variant="ghost" onPress={() => undo(toast)}>
            <Text>Undo</Text>
          </Button>
        </View>
      )}
    </ControlFrame>
  );
}

function SmallButton({
  label,
  hint,
  onPress,
  disabled,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint}
      className={cn(
        "bg-muted min-h-8 flex-1 items-center justify-center rounded-sm",
        disabled && "opacity-40",
      )}
    >
      <Text className="text-foreground text-sm">{label}</Text>
    </Pressable>
  );
}

function SheetButton({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Button size="sm" variant={destructive ? "destructive" : "secondary"} onPress={onPress}>
      <Text>{label}</Text>
    </Button>
  );
}
