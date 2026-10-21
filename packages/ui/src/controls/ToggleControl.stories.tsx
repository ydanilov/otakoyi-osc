import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { expect, userEvent } from "storybook/test";
import { ControlHarness } from "../stories/ControlHarness";
import { makeControl } from "../stories/controls";
import { componentDocs, OSC_SOURCE } from "../stories/docs";

function ToggleStory({ on, disabled, label }: { on: boolean; disabled: boolean; label: string }) {
  const control = React.useMemo(
    () => makeControl({ type: "toggle", id: "strobe", address: "/fx/strobe", label }),
    [label],
  );
  return (
    <ControlHarness control={control} value={on} disabled={disabled} width={150} height={88} />
  );
}

const meta = {
  title: "Controls/Toggle",
  component: ToggleStory,
  args: { on: false, disabled: false, label: "Strobe" },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose: "Latched on/off on the pult: a layer, an effect, a mode. Schema type `toggle`.",
          use: ["Binary state that stays until changed."],
          avoid: ["App settings — Switch (LedSwitch).", "Momentary triggers — Button (Pad)."],
          do: ["Label the thing, not the action (“Strobe”, not “Turn strobe on”)."],
          dont: ["Don't use two toggles for mutually exclusive options — Segmented."],
          anatomy: ["Pad (lit fill when on)", "Label", "ON / OFF caption"],
          behaviour: [
            `Sends \`on\` args when switched on and \`off\` args when switched off — ${OSC_SOURCE}.`,
            "Feedback updates the state.",
          ],
          a11y: ["Role `switch` with `checked`."],
          content: ["Label ≤ 12 characters."],
          figma: {
            component: "Toggle",
            node: "12:30",
            variants: [
              ["State=Off", "value false"],
              ["State=On", "value true"],
              ["State=Disabled", "disabled"],
            ],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof ToggleStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("switch", { name: "Strobe" }));
    await expect(await canvas.findByText("OSC → /fx/strobe 1")).toBeVisible();
  },
};
export const On: Story = { args: { on: true } };
export const Disabled: Story = { args: { disabled: true } };
