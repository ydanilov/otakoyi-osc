import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { View } from "react-native";
import { expect, screen, userEvent, waitFor } from "storybook/test";
import { Button } from "../chrome/Button";
import { Chip } from "../chrome/Status";
import { QrCodeIcon } from "../ds/icons";
import type { DialogPresentation } from "../ds/logic";
import { componentDocs } from "../stories/docs";
import { Dialog } from "./Dialog";

function Demo({
  presentation,
  startOpen = true,
}: {
  presentation?: DialogPresentation;
  startOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(startOpen);
  return (
    <View style={{ minHeight: 560 }}>
      <Button label="Pair a device" onPress={() => setOpen(true)} />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        presentation={presentation}
        icon={QrCodeIcon}
        title="QR is on the installation screen"
        description="Scan it with the new phone or tablet. It hides by itself in 2 minutes."
        actions={
          <>
            <Button
              label="Hide QR"
              variant="secondary"
              onPress={() => setOpen(false)}
              className="flex-1"
            />
            <Button label="Done" onPress={() => setOpen(false)} className="flex-1" />
          </>
        }
      >
        <Chip label="1:42 left" />
      </Dialog>
    </View>
  );
}

const meta = {
  title: "Containers/Dialog",
  component: Demo,
  parameters: {
    layout: "fullscreen",
    docs: {
      story: { inline: false, height: "600px" },
      description: {
        component: componentDocs({
          purpose:
            "Slot container for a focused task or confirmation over the pult: pairing QR, confirmations, what's new.",
          use: ["Short tasks that must finish before going back to the pult."],
          avoid: [
            "Long settings — use a drawer page.",
            "Critical installation actions — Quick Action with hold, not a confirm dialog.",
          ],
          do: [
            "Primary action last (right); at most two actions.",
            "Let the scrim dismiss unless the user must decide.",
          ],
          dont: ["Don't open a dialog from a dialog."],
          anatomy: [
            "Scrim (dim + blur)",
            "Surface: raised, radius xl",
            "Grabber (sheet only)",
            "Icon well (raised SM, lit icon)",
            "Title (Heading/XL) + description",
            "Body slot (children)",
            "Actions slot",
          ],
          behaviour: [
            "Presentation by window width (`dialogPresentation`): < 600 pt → bottom sheet sliding up; otherwise centred modal fading in (ADR-013). `presentation` overrides for reviews.",
            "Scrim tap / Android back closes when `dismissable` (default).",
            "Body scrolls if taller than 80–90 % of the window.",
          ],
          a11y: [
            "`accessibilityViewIsModal` / `aria-modal`; title has role `header`.",
            "Sheet respects the bottom safe area; buttons ≥ 40 pt high.",
          ],
          content: ["Title ≤ 40 characters (2 lines max). Description ≤ 120 characters."],
          figma: {
            component: "Dialog",
            node: "47:208",
            variants: [
              ["Container=Sheet", 'presentation="sheet" (phone width)'],
              ["Container=Modal", 'presentation="modal" (tablet width)'],
            ],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ByWindowWidth: Story = {
  args: { startOpen: false },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Pair a device" }));
    const done = await screen.findByRole("button", { name: "Done" });
    await userEvent.click(done);
    await waitFor(() => expect(screen.queryByText("QR is on the installation screen")).toBeNull());
  },
};
export const Sheet: Story = {
  args: { presentation: "sheet" },
  globals: { viewport: { value: "phone" } },
};
export const Modal: Story = {
  args: { presentation: "modal" },
  globals: { viewport: { value: "tablet" } },
};
