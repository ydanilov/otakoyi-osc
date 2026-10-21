import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { expect, fn, userEvent } from "storybook/test";
import { Text } from "../components/ui/text";
import { componentDocs } from "../stories/docs";
import { Button } from "./Button";
import { Scrim } from "./Scrim";

const meta = {
  title: "Chrome/Scrim",
  component: Scrim,
  args: { onPress: fn(), intensity: 24 },
  argTypes: { intensity: { control: { type: "range", min: 1, max: 100 } } },
  decorators: [
    (Story) => (
      <View style={{ width: 360, height: 300, padding: 16, gap: 12 }}>
        <Text className="text-foreground text-lg font-semibold">Pult behind the scrim</Text>
        <Button label="Take control" />
        <Text className="text-muted-foreground text-sm">
          The scrim dims and blurs this content.
        </Text>
        <Story />
      </View>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose:
            "Dims and blurs the pult behind a Dialog, sheet or drawer so the overlay reads as the focus.",
          use: ["Under every modal surface. Dialog and Drawer include it."],
          avoid: ["As decoration on screens without an overlay."],
          do: ["Let a tap on the scrim dismiss non-critical overlays."],
          dont: ["Don't dismiss on scrim tap when the user must decide (pass no `onPress`)."],
          anatomy: [
            "Blur layer (expo-blur: native on iOS, backdrop-filter on web)",
            "Overlay colour (`color.overlay`, per mode)",
            "Optional dismiss target",
          ],
          behaviour: [
            "`onPress` dismisses; without it the scrim only blocks touches behind.",
            "Android without a blur target shows the dim layer only.",
          ],
          a11y: ["Dismiss target is a button labelled “Close” (or `dismissLabel`)."],
          content: ["No content."],
          figma: { component: "Scrim", node: "46:187" },
        }),
      },
    },
  },
} satisfies Meta<typeof Scrim>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dismissable: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Close" }));
    await expect(args.onPress).toHaveBeenCalled();
  },
};
export const Blocking: Story = { args: { onPress: undefined } };
