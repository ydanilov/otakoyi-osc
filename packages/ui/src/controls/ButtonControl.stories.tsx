import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { ControlHarness } from "../stories/ControlHarness";
import { makeControl } from "../stories/controls";
import { componentDocs, OSC_SOURCE } from "../stories/docs";

function ButtonStory({
  label,
  pressed,
  disabled,
}: {
  label: string;
  pressed: boolean;
  disabled: boolean;
}) {
  const control = React.useMemo(
    () => makeControl({ type: "button", id: "flash", address: "/fx/flash", label }),
    [label],
  );
  return (
    <ControlHarness
      control={control}
      value={{ pressed }}
      disabled={disabled}
      width={150}
      height={88}
    />
  );
}

const meta = {
  title: "Controls/Button (Pad)",
  component: ButtonStory,
  args: { label: "Flash", pressed: false, disabled: false },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose:
            "Momentary pult button: fires while held (strobe, flash, trigger). Schema type `button`; drawn as the Figma Pad.",
          use: ["Triggers and momentary effects on the pult."],
          avoid: ["App chrome actions — Button (chrome).", "Latched on/off — Toggle."],
          do: ["Use short verbs or effect names as labels."],
          dont: ["Don't rely on long presses — the press itself is the action."],
          anatomy: ["Pad (raised; lit fill while pressed)", "Label (centred, scales down to 70 %)"],
          behaviour: [
            `Sends \`press\` args on touch down and \`release\` args on touch up — ${OSC_SOURCE}.`,
            "Feedback can light the pad (`{ pressed: true }`).",
          ],
          a11y: ["Role `button`, label = control label."],
          content: ["Label ≤ 12 characters; shrinks to 70 % then truncates."],
          figma: {
            component: "Pad",
            node: "12:40",
            variants: [
              ["State=Idle", "—"],
              ["State=Pressed", "value { pressed: true }"],
              ["State=Disabled", "disabled"],
            ],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof ButtonStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Pressed: Story = { args: { pressed: true } };
export const Disabled: Story = { args: { disabled: true } };
