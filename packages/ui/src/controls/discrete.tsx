import { formatValue, hexToRgb, isGroupValue, toggleInGroup } from "@osc/controls";
import type { UnsupportedControl } from "@osc/schema";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { ControlFrame } from "./ControlFrame";
import type { ControlProps } from "./types";

/** Shared pad: the big tappable surface used by buttons, toggles, grid cells and scenes. */
function Pad({
  active,
  disabled,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Pressable> & {
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      disabled={disabled}
      className={cn(
        "min-h-touch flex-1 items-center justify-center rounded-md border px-3",
        active ? "border-primary bg-primary" : "border-border bg-card active:bg-secondary",
        className,
      )}
      {...props}
    >
      {children}
    </Pressable>
  );
}

function PadLabel({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <Text
      className={cn(
        "text-center text-sm font-semibold",
        active ? "text-primary-foreground" : "text-foreground",
      )}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {children}
    </Text>
  );
}

/** Momentary button: sends `press` on touch down and `release` on touch up. */
export function ButtonControl({ control: c, value, onChange, disabled }: ControlProps<"button">) {
  const pressed =
    typeof value === "object" && value !== null && "pressed" in value && value.pressed;
  return (
    <ControlFrame disabled={disabled}>
      <Pad
        active={!!pressed}
        disabled={disabled}
        onPressIn={() => onChange({ pressed: true })}
        onPressOut={() => onChange({ pressed: false })}
        accessibilityRole="button"
        accessibilityLabel={c.label ?? c.id}
      >
        <PadLabel active={!!pressed}>{c.label ?? c.id}</PadLabel>
      </Pad>
    </ControlFrame>
  );
}

/** Status LED: lit (control signal colour) or dark (inset bed). */
export function Led({ on, className }: { on: boolean; className?: string }) {
  return (
    <View
      className={cn("h-2 w-2 rounded-full", on ? "bg-control-fill" : "bg-control-track", className)}
    />
  );
}

export function ToggleControl(props: ControlProps<"toggle">) {
  return props.control.style === "switch" ? (
    <SwitchToggle {...props} />
  ) : (
    <ButtonToggle {...props} />
  );
}

/** Hardware-style latching switch with ON and OFF LEDs (toggle `style: "switch"`). */
function SwitchToggle({ control: c, value, onChange, disabled }: ControlProps<"toggle">) {
  const on = value === true;
  return (
    <ControlFrame label={c.label} disabled={disabled}>
      <Pressable
        disabled={disabled}
        onPress={() => onChange(!on)}
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled: !!disabled }}
        accessibilityLabel={c.label ?? c.id}
        className="bg-card border-border min-h-touch flex-1 flex-row items-center gap-3 rounded-md border px-3"
      >
        <View className="bg-muted h-8 w-14 justify-center rounded-full p-1">
          <View
            className={cn(
              "h-6 w-6 rounded-full",
              on ? "bg-primary translate-x-6" : "bg-secondary translate-x-0",
            )}
          />
        </View>
        <View className="gap-1">
          <View className="flex-row items-center gap-2">
            <Led on={on} />
            <Text className={cn("text-xs", on ? "text-foreground" : "text-muted-foreground")}>
              ON
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Led on={!on} />
            <Text className={cn("text-xs", on ? "text-muted-foreground" : "text-foreground")}>
              OFF
            </Text>
          </View>
        </View>
      </Pressable>
    </ControlFrame>
  );
}

function ButtonToggle({ control: c, value, onChange, disabled }: ControlProps<"toggle">) {
  const on = value === true;
  return (
    <ControlFrame disabled={disabled}>
      <Pad
        active={on}
        disabled={disabled}
        onPress={() => onChange(!on)}
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled: !!disabled }}
        accessibilityLabel={c.label ?? c.id}
      >
        <PadLabel active={on}>{c.label ?? c.id}</PadLabel>
        <Text
          className={cn(
            "mt-1 text-xs",
            on ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {on ? "ON" : "OFF"}
        </Text>
      </Pad>
    </ControlFrame>
  );
}

export function Segmented({ control: c, value, onChange, disabled }: ControlProps<"segmented">) {
  const selected = typeof value === "number" ? value : c.default;
  return (
    <ControlFrame label={c.label} disabled={disabled}>
      <View
        className="bg-muted flex-1 flex-row gap-1 rounded-md p-1"
        accessibilityRole="radiogroup"
      >
        {c.options.map((o, i) => {
          const active = i === selected;
          return (
            <Pressable
              key={i}
              disabled={disabled}
              onPress={() => onChange(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              className={cn(
                "min-h-touch flex-1 items-center justify-center rounded-sm px-2",
                active ? "bg-primary" : "active:bg-secondary",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium",
                  active ? "text-primary-foreground" : "text-muted-foreground",
                )}
                numberOfLines={1}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ControlFrame>
  );
}

/** Grid of pads. `radio` keeps one cell lit, `toggle` latches each cell, `momentary` lights while held. */
export function ButtonGrid({ control: c, value, onChange, disabled }: ControlProps<"buttonGrid">) {
  const [lit, setLit] = React.useState<Set<number>>(new Set());
  React.useEffect(() => {
    if (typeof value !== "object" || value === null || !("cell" in value)) return;
    setLit((prev) => {
      const next = c.mode === "radio" ? new Set<number>() : new Set(prev);
      if (value.on) next.add(value.cell);
      else next.delete(value.cell);
      return next;
    });
  }, [value, c.mode]);

  const rows = Array.from({ length: c.rows }, (_, r) => r);
  const cols = Array.from({ length: c.cols }, (_, k) => k);
  return (
    <ControlFrame label={c.label} disabled={disabled}>
      <View className="flex-1 gap-2">
        {rows.map((r) => (
          <View key={r} className="flex-1 flex-row gap-2">
            {cols.map((k) => {
              const cell = r * c.cols + k;
              const on = lit.has(cell);
              const label = c.labels?.[cell] ?? String(cell + 1);
              const press = () => {
                if (c.mode === "momentary") onChange({ cell, on: true });
                else if (c.mode === "radio") onChange({ cell, on: true });
                else onChange({ cell, on: !on });
              };
              return (
                <Pad
                  key={k}
                  active={on}
                  disabled={disabled}
                  className="min-h-0 px-1"
                  onPressIn={press}
                  onPressOut={() => c.mode === "momentary" && onChange({ cell, on: false })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${c.label ?? c.id} ${label}`}
                >
                  <PadLabel active={on}>{label}</PadLabel>
                </Pad>
              );
            })}
          </View>
        ))}
      </View>
    </ControlFrame>
  );
}

export function SceneList({ control: c, value, onChange, disabled }: ControlProps<"sceneList">) {
  return (
    <ControlFrame label={c.label} disabled={disabled}>
      <ScrollView contentContainerClassName="gap-2" className="flex-1">
        {c.scenes.map((s) => {
          const active = value === s.id;
          return (
            <Pad
              key={s.id}
              active={active}
              disabled={disabled}
              onPress={() => onChange(s.id)}
              className="min-h-14 flex-none flex-row justify-between"
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <PadLabel active={active}>{s.label}</PadLabel>
              {active && (
                <Text className="text-primary-foreground text-xs font-medium uppercase">Live</Text>
              )}
            </Pad>
          );
        })}
      </ScrollView>
    </ControlFrame>
  );
}

/** Multi-select latching buttons with an LED strip; each button toggles on its own. */
export function ButtonGroup({
  control: c,
  value,
  onChange,
  disabled,
}: ControlProps<"buttonGroup">) {
  const lit = new Set(isGroupValue(value) ? value.on : c.default);
  return (
    <ControlFrame label={c.label} disabled={disabled}>
      <View className="flex-1 flex-row gap-2">
        {c.buttons.map((b) => {
          const on = lit.has(b.id);
          return (
            <Pad
              key={b.id}
              active={on}
              disabled={disabled}
              className="min-h-0 gap-1 px-1"
              onPress={() => onChange(toggleInGroup(c, value, b.id))}
              accessibilityRole="switch"
              accessibilityState={{ checked: on, disabled: !!disabled }}
              accessibilityLabel={b.label}
            >
              <Led on={on} className={on ? "bg-primary-foreground" : undefined} />
              <PadLabel active={on}>{b.label}</PadLabel>
              {b.caption && (
                <Text
                  className={cn(
                    "font-mono text-xs",
                    on ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                  numberOfLines={1}
                >
                  {b.caption}
                </Text>
              )}
            </Pad>
          );
        })}
      </View>
    </ControlFrame>
  );
}

const LABEL_SIZE = { sm: "text-sm", md: "text-lg", lg: "text-2xl", xl: "text-display" } as const;

export function LabelControl({ control: c, value }: ControlProps<"label">) {
  const text =
    value === null || value === undefined || value === ""
      ? c.text || "—"
      : formatValue(value as string, { format: c.format });
  return (
    <ControlFrame label={c.label}>
      <View
        className="bg-card flex-1 justify-center rounded-md border border-border px-3"
        accessible
        accessibilityRole="text"
      >
        <Text
          className={cn("text-foreground font-mono font-semibold", LABEL_SIZE[c.size])}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {text}
        </Text>
      </View>
    </ControlFrame>
  );
}

/** Colour picker: a palette of swatches (the client's brand colours by default). Free picking is planned for V2. */
export function ColorPicker({
  control: c,
  value,
  onChange,
  disabled,
}: ControlProps<"colorPicker">) {
  const current = typeof value === "string" ? value.toUpperCase() : (c.default ?? "#FFFFFF");
  const swatches = c.swatches ?? [
    "#FFFFFF",
    "#FF3B30",
    "#FF9500",
    "#FFCC00",
    "#34C759",
    "#00C7BE",
    "#007AFF",
    "#AF52DE",
  ];
  const [r, g, b] = hexToRgb(current);
  return (
    <ControlFrame label={c.label} value={current} disabled={disabled}>
      <View className="flex-1 flex-row flex-wrap gap-2">
        {swatches.map((hex) => {
          const active = hex.toUpperCase() === current;
          return (
            <Pressable
              key={hex}
              disabled={disabled}
              onPress={() => onChange(hex.toUpperCase())}
              accessibilityRole="radio"
              accessibilityLabel={hex}
              accessibilityState={{ selected: active }}
              style={{ backgroundColor: hex }}
              className={cn(
                "min-h-touch min-w-touch flex-1 rounded-md border-2",
                active ? "border-foreground" : "border-transparent",
              )}
            />
          );
        })}
      </View>
      <Text className="text-muted-foreground mt-2 font-mono text-xs">
        RGB {r} {g} {b}
      </Text>
    </ControlFrame>
  );
}

/** Shown for control types added in a newer app version. The rest of the pult keeps working. */
export function UnsupportedPlaceholder({ control }: { control: UnsupportedControl }) {
  return (
    <View className="flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-border p-3">
      <Text className="text-foreground text-sm font-medium">Update the app</Text>
      <Text className="text-muted-foreground text-center text-xs">
        This control ({control.originalType}) needs a newer version.
      </Text>
    </View>
  );
}
