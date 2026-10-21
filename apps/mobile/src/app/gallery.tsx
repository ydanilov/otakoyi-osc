import { initialValue, type ControlValue } from "@osc/controls";
import type { Control, ControlType } from "@osc/schema";
import type { BrandInput } from "@osc/tokens";
import { controlRegistry, ThemeProvider, type ControlProps } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { demoConfig } from "@/lib/demo";

/**
 * Control gallery — every control type in every state, under different themes and client brands.
 * The design-system review page (instead of Storybook): open /gallery on the web pult or in the app.
 * Not a pult, so it may scroll.
 */
const BRANDS: { name: string; brand: BrandInput }[] = [
  { name: "Otakoyi · dark", brand: { mode: "dark" } },
  { name: "Otakoyi · light", brand: { mode: "light" } },
  { name: "Client A · dark", brand: { mode: "dark", primary: "#FF5A1F", accent: "#FFD23F" } },
  { name: "Client B · light", brand: { mode: "light", primary: "#3D5AFE", accent: "#00BFA5" } },
];

/** One example of every control type, taken from the demo installation (presets applied). */
const CONTROLS: Control[] = (() => {
  const seen = new Set<ControlType>();
  const out: Control[] = [];
  for (const p of demoConfig.pults)
    for (const g of p.pages)
      for (const c of g.controls)
        if (c.type !== "unsupported" && !seen.has(c.type)) {
          seen.add(c.type);
          out.push(c);
        }
  return out;
})();

/** A value that shows the control "in use" next to its initial value. */
function activeValue(c: Control): ControlValue {
  switch (c.type) {
    case "fader":
    case "knob":
      return c.min + (c.max - c.min) * 0.8;
    case "meter":
      return c.min + (c.max - c.min) * 0.9;
    case "toggle":
      return true;
    case "xy":
      return { x: 0.75, y: 0.3 };
    case "segmented":
      return Math.min(1, c.options.length - 1);
    case "sceneList":
      return c.scenes[1]?.id ?? null;
    case "buttonGrid":
      return { cell: 5, on: true };
    case "label":
      return "59.9";
    case "colorPicker":
      return c.swatches?.[1] ?? "#3DD6FF";
    case "button":
      return { pressed: true };
    case "holdToConfirm":
      return null;
  }
}

const STATES = ["Initial", "Active", "View only"] as const;

function Cell({ control, state }: { control: Control; state: (typeof STATES)[number] }) {
  const [value, setValue] = React.useState<ControlValue>(
    state === "Active" ? activeValue(control) : initialValue(control),
  );
  const Component = controlRegistry[control.type] as React.ComponentType<ControlProps<ControlType>>;
  const tall = ["fader", "meter", "xy", "sceneList", "buttonGrid"].includes(control.type);
  return (
    <View className={cn("w-56 gap-2", tall ? "h-64" : "h-40")}>
      <Text className="text-muted-foreground font-mono text-xs">
        {control.type} · {state}
      </Text>
      <View className="flex-1">
        <Component
          control={control as never}
          value={value}
          onChange={setValue}
          disabled={state === "View only"}
        />
      </View>
    </View>
  );
}

export default function Gallery() {
  const [i, setI] = React.useState(0);
  const current = BRANDS[i]!;
  return (
    <ThemeProvider brand={current.brand} className="flex-1">
      <SafeAreaView className="bg-background flex-1">
        <View className="border-border flex-row flex-wrap items-center gap-2 border-b px-4 py-3">
          <Text className="text-foreground mr-2 text-lg font-semibold">Control gallery</Text>
          {BRANDS.map((b, k) => (
            <Pressable
              key={b.name}
              onPress={() => setI(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: k === i }}
              className={cn("rounded-md px-3 py-2", k === i ? "bg-muted" : "")}
            >
              <Text
                className={cn("text-sm", k === i ? "text-foreground" : "text-muted-foreground")}
              >
                {b.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerClassName="gap-8 p-4">
          {CONTROLS.map((c) => (
            <View key={c.id} className="gap-3">
              <Text className="text-foreground font-semibold">{c.type}</Text>
              <View className="flex-row flex-wrap gap-6">
                {STATES.map((s) => (
                  <Cell key={`${current.name}-${c.id}-${s}`} control={c} state={s} />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemeProvider>
  );
}
