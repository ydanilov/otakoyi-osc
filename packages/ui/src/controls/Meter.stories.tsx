import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { ControlHarness } from "../stories/ControlHarness";
import { makeControl } from "../stories/controls";
import { componentDocs, OSC_SOURCE } from "../stories/docs";

function MeterStory({
  value,
  orientation,
}: {
  value: number;
  orientation: "vertical" | "horizontal";
}) {
  const control = React.useMemo(
    () =>
      makeControl({
        type: "meter",
        id: "audio",
        feedback: "/audio/level",
        label: "Audio",
        warnAt: 0.7,
        criticalAt: 0.9,
        orientation,
      }),
    [orientation],
  );
  const vertical = orientation === "vertical";
  return (
    <ControlHarness
      control={control}
      value={value}
      width={vertical ? 80 : 300}
      height={vertical ? 240 : 80}
      showOsc={false}
    />
  );
}

const meta = {
  title: "Controls/Meter",
  component: MeterStory,
  args: { value: 0.5, orientation: "vertical" },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    orientation: { control: "inline-radio", options: ["vertical", "horizontal"] },
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose:
            "Display-only level from the installation: audio level, crowd count, load. Schema type `meter`.",
          use: ["Live feedback the operator needs at a glance."],
          avoid: ["Anything the user sets — meters never send."],
          do: ["Set `warnAt` / `criticalAt` so the colour means something."],
          dont: ["Don't brand the warning/critical colours — they are status tokens."],
          anatomy: [
            "Label + value",
            "Inset bed",
            "Fill: signal → warning → critical by level (`meterLevel`)",
          ],
          behaviour: [
            `Sends nothing (${OSC_SOURCE}); listens on \`feedback\`.`,
            "Animates in `motion.duration.instant` (80 ms) to stay live, not decorative.",
          ],
          a11y: ["Value is read as text; status words come from the parent screen if needed."],
          content: ["Label ≤ 10 characters."],
          figma: {
            component: "Meter",
            node: "11:172",
            variants: [
              ["Level=Normal", "value < warnAt"],
              ["Level=Warning", "warnAt ≤ value < criticalAt"],
              ["Level=Critical", "value ≥ criticalAt"],
            ],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof MeterStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {};
export const Warning: Story = { args: { value: 0.8 } };
export const Critical: Story = { args: { value: 0.95 } };
export const Horizontal: Story = { args: { orientation: "horizontal", value: 0.6 } };
