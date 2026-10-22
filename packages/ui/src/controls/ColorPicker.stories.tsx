import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { ControlHarness } from "../stories/ControlHarness";
import { makeControl } from "../stories/controls";
import { componentDocs, OSC_SOURCE } from "../stories/docs";

function ColorStory({
  value,
  disabled,
  format,
}: {
  value: string;
  disabled: boolean;
  format: "rgbFloat" | "rgbInt" | "hsvFloat" | "hex";
}) {
  const control = React.useMemo(
    () => makeControl({ type: "colorPicker", id: "tint", address: "/tint", label: "Tint", format }),
    [format],
  );
  return (
    <ControlHarness control={control} value={value} disabled={disabled} width={300} height={130} />
  );
}

const meta = {
  title: "Controls/Color Picker",
  component: ColorStory,
  args: { value: "#FF3B30", disabled: false, format: "rgbFloat" },
  argTypes: {
    format: { control: "inline-radio", options: ["rgbFloat", "rgbInt", "hsvFloat", "hex"] },
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose:
            "Pick a colour from a palette (the client's brand colours by default). Schema type `colorPicker`.",
          use: ["Tinting lights or visuals with a fixed palette."],
          avoid: ["Continuous hue — hue knob (feat/new-controls)."],
          do: ["Pass `swatches` with the client's palette."],
          dont: ["Don't offer more than 8 swatches."],
          anatomy: [
            "Label + hex value",
            "Swatches (selected has a foreground ring)",
            "RGB caption (mono)",
          ],
          behaviour: [
            `Sends \`address\` as rgb floats 0–1 (default), rgb ints, hsv floats or a hex string per \`format\` — ${OSC_SOURCE}.`,
          ],
          a11y: ["Swatches are `radio` labelled with their hex."],
          content: ["—"],
          figma: { component: "Color Picker", node: "12:141" },
        }),
      },
    },
  },
} satisfies Meta<typeof ColorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Hex: Story = { args: { format: "hex" } };
export const Disabled: Story = { args: { disabled: true } };
