import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { ControlHarness } from "../stories/ControlHarness";
import { makeControl } from "../stories/controls";
import { componentDocs, OSC_SOURCE } from "../stories/docs";

function KnobStory({
  value,
  disabled,
  label,
  centered,
  unit,
  min,
  max,
}: {
  value: number;
  disabled: boolean;
  label: string;
  centered: boolean;
  unit: string;
  min: number;
  max: number;
}) {
  const control = React.useMemo(
    () =>
      makeControl({
        type: "knob",
        id: "gain",
        address: "/fx/gain",
        label,
        centered,
        unit,
        min,
        max,
      }),
    [label, centered, unit, min, max],
  );
  return (
    <ControlHarness control={control} value={value} disabled={disabled} width={180} height={180} />
  );
}

const meta = {
  title: "Controls/Knob",
  component: KnobStory,
  args: { label: "Gain", value: 0.4, disabled: false, centered: false, unit: "", min: 0, max: 1 },
  argTypes: { value: { control: { type: "range", min: 0, max: 1, step: 0.01 } } },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose: "Rotary value for dense layouts: effect amounts, hue, gain. Schema type `knob`.",
          use: [
            "Many parameters in little space (Knob Group, Camera Control).",
            "Parameters people set and leave.",
          ],
          avoid: ["The main level of a layer — Fader is faster to read and ride."],
          do: ["Group knobs that belong together in a Console Panel."],
          dont: ["Don't make knobs smaller than 72 pt; the drag needs room."],
          anatomy: [
            "Label + value readout",
            "Track arc (control track)",
            "Lit arc (control/signal) from start (or centre)",
            "Knob cap with indicator line",
          ],
          behaviour: [
            `Sends \`address\` with one float (int with \`int: true\`) per change — ${OSC_SOURCE}. Throttled like the Fader.`,
            "Relative only: dragging up/right increases by distance (220 px per full sweep); a touch never moves it.",
            "Fine mode with two fingers (×`fineFactor`); double-tap resets to `default`.",
            "Relative-encoder and hue knobs (Figma Mode=Relative, Mode=Color) and the 240° travel are new control behaviour on feat/new-controls; stories follow there.",
          ],
          a11y: [
            "Role `adjustable`, value with unit; VoiceOver swipe steps.",
            "Hit area = whole cell (≥ 72 pt).",
          ],
          content: ["Label ≤ 10 characters (the cell is narrow)."],
          figma: {
            component: "Knob",
            node: "11:112",
            variants: [
              ["Mode=Absolute", "default"],
              ["Mode=Relative", "endless / relative (feat/new-controls)"],
              ["Mode=Color", "hue knob (feat/new-controls)"],
              ["Orientation=Vertical | Horizontal", "label placement in the cell"],
              ["State=Fine", "two-finger drag (runtime)"],
              ["State=Disabled", "disabled"],
            ],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof KnobStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Centered: Story = {
  args: { label: "Pan", centered: true, value: 0.5, min: -1, max: 1 },
};
export const WithUnit: Story = {
  args: { label: "Hue shift", unit: "°", min: 0, max: 360, value: 45 },
};
export const Disabled: Story = { args: { disabled: true } };
