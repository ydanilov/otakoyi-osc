import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { fn } from "storybook/test";
import { BrandMark } from "../chrome/Brand";
import { componentDocs } from "../stories/docs";
import { PultHeader } from "./PultHeader";

const meta = {
  title: "Pult/Pult Header",
  component: PultHeader,
  args: { name: "Lobby wall", connection: "online", mode: "control", onRequestControl: fn() },
  argTypes: {
    connection: { control: "inline-radio", options: ["online", "connecting", "offline"] },
    mode: {
      control: "inline-radio",
      options: ["control", "view", "studio-has-control", "offline"],
    },
    logo: { control: false },
    switcher: { control: false },
  },
  decorators: [
    (Story) => (
      <View style={{ maxWidth: 820 }}>
        <Story />
      </View>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose:
            "The minimal header above every pult (ADR-013 addendum): name or pult switcher, connection, and the view-only / studio banners.",
          use: ["Top of the pult screen, on phone and tablet."],
          avoid: ["Settings or installation actions — they live in the drawers."],
          do: ["Keep it to one line in Control mode so the pult gets the height."],
          dont: ["Don't add buttons beyond the drawer openers and Take control."],
          anatomy: [
            "Logo slot",
            "Installation name (hidden on phones when a switcher is shown)",
            "Pult switcher slot",
            "Connection",
            "Status Banner (View / Studio)",
          ],
          behaviour: [
            "`mode` comes from the store (lease): control → no banner; view → View only + Take control; studio-has-control → studio banner.",
          ],
          a11y: ["Banners are polite live regions; Take control is a button."],
          content: ["Name ≤ 24 characters; truncates."],
          figma: {
            component: "Pult Header",
            node: "10:76",
            variants: [
              ["Mode=Control", 'mode="control"'],
              ["Mode=View", 'mode="view"'],
              ["Mode=Studio", 'mode="studio-has-control"'],
            ],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof PultHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Control: Story = {};
export const ViewOnly: Story = { args: { mode: "view" } };
export const Studio: Story = { args: { mode: "studio-has-control" } };
export const Offline: Story = { args: { connection: "offline", mode: "offline" } };
export const WithLogo: Story = { args: { logo: <BrandMark size="sm" /> } };
