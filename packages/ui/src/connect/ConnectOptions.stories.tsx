import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { expect, fn, userEvent } from "storybook/test";
import { componentDocs } from "../stories/docs";
import { ConnectOptions } from "./Connect";

const meta = {
  title: "Connect/Connect Options",
  component: ConnectOptions,
  args: { onScan: fn(), onEnterAddress: fn(), onDemo: fn() },
  decorators: [
    (Story) => (
      <View style={{ width: 390, height: 760 }}>
        <Story />
      </View>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose:
            "The first screen (ADR-012, no client login): scan the pairing QR, enter address and PIN, or try the demo.",
          use: ["App start without a saved pairing; after “Forget this installation”."],
          avoid: ["Accounts, passwords or sign-in — clients never log in."],
          do: ["Scan is the primary action; demo is the low-emphasis one."],
          dont: ["Don't show the pult before pairing (except the demo)."],
          anatomy: [
            "Brand Mark + Wordmark",
            "Scan pairing QR (Primary LG)",
            "Enter address and PIN (Secondary LG) → sheet with Connect Form",
            "Try the demo (Ghost)",
            "Note: where the QR is",
          ],
          behaviour: [
            "Scan opens the camera with the Viewfinder; address/PIN opens a sheet; demo starts the in-app simulated installation.",
          ],
          a11y: ["Three buttons in reading order; ≥ 48 pt high."],
          content: ["Fixed copy."],
          figma: {
            component: "Connect screen (Screens)",
            variants: [["Connect · phone / tablet", "ConnectOptions"]],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof ConnectOptions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Try the demo" }));
    await expect(args.onDemo).toHaveBeenCalled();
  },
};
