import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { View } from "react-native";
import { expect, screen, userEvent, waitFor } from "storybook/test";
import { Button } from "../chrome/Button";
import { NavItem } from "../chrome/Navigation";
import { ConnectionStatus } from "../chrome/Status";
import { Text } from "../components/ui/text";
import {
  CircleHalfIcon,
  LifebuoyIcon,
  QrCodeIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
} from "../ds/icons";
import { ListRow } from "../forms/ListRow";
import { InstallationActions } from "../patterns/Installation";
import { componentDocs } from "../stories/docs";
import { ListCard, Section } from "./Cards";
import { Drawer, DrawerEdge, type DrawerSide } from "./Drawer";

function Demo({ side, startOpen = true }: { side: DrawerSide; startOpen?: boolean }) {
  const [open, setOpen] = React.useState(startOpen);
  const [modes, setModes] = React.useState<Record<string, boolean>>({ idle: false, pause: false });
  return (
    <View style={{ height: 700, overflow: "hidden" }} className="bg-background">
      <View className="flex-1 items-center justify-center gap-3">
        <Text className="text-muted-foreground text-sm">Pult (never scrolls)</Text>
        <Button
          label={side === "left" ? "Open Settings" : "Open Installation"}
          variant="secondary"
          onPress={() => setOpen(true)}
        />
      </View>
      <DrawerEdge side={side} onOpen={() => setOpen(true)} />
      {side === "left" ? (
        <Drawer
          side="left"
          open={open}
          onOpenChange={setOpen}
          title="Settings"
          footer={
            <ListCard>
              <ListRow
                title="Sign out"
                icon={SignOutIcon}
                trailing="destructive"
                onPress={() => {}}
              />
            </ListCard>
          }
        >
          <View style={{ gap: 4 }}>
            <NavItem icon={CircleHalfIcon} label="Appearance" active />
            <NavItem icon={SlidersHorizontalIcon} label="Control preferences" />
            <NavItem icon={QrCodeIcon} label="Pair a device" />
            <NavItem icon={LifebuoyIcon} label="Help" />
          </View>
        </Drawer>
      ) : (
        <Drawer side="right" open={open} onOpenChange={setOpen} title="Lobby wall">
          <ConnectionStatus state="online" />
          <InstallationActions
            modeState={modes}
            onModeChange={(id, on) => setModes((m) => ({ ...m, [id]: on }))}
          />
          <Section title="Pult">
            <ListCard>
              <ListRow title="Lobby controller" value="current" trailing="value" />
              <ListRow title="VJ console" onPress={() => {}} />
            </ListCard>
          </Section>
        </Drawer>
      )}
    </View>
  );
}

const meta = {
  title: "Containers/Drawer",
  component: Demo,
  args: { side: "left" },
  argTypes: { side: { control: "inline-radio", options: ["left", "right"] } },
  parameters: {
    layout: "fullscreen",
    docs: {
      story: { inline: false, height: "720px" },
      description: {
        component: componentDocs({
          purpose:
            "The two swipe drawers over the pult (ADR-013 addendum): left = Settings, right = Installation. Everything that is not a control lives here.",
          use: [
            "Left: appearance, control preferences, pairing QR, what's new, help, sign out.",
            "Right: installation name and status, pult switcher, quick actions, modes.",
          ],
          avoid: ["Take control — that is the header banner, never in a drawer.", "Pult controls."],
          do: ["Let drawers scroll vertically when content is long — the pult never does."],
          dont: ["Don't add a third drawer or bottom tabs."],
          anatomy: [
            "Scrim (dim + blur, fades with the drag)",
            "Panel: raised, full height, 85 % of the width (max 380 pt)",
            "Title row + close Icon Button",
            "Scrolling body (slot)",
            "Pinned footer (slot)",
          ],
          behaviour: [
            "Slides in `motion.duration.base`; Reduce Motion jumps.",
            "Drag toward the edge to close; on release `drawerStaysOpen()` keeps it open unless dragged past a third or flicked (unit-tested).",
            "`DrawerEdge` is a 20 pt invisible strip on the screen edge: swipe toward the centre opens (`edgeSwipeOpens`).",
            "Scrim tap closes.",
          ],
          a11y: [
            "Panel is modal for VoiceOver; close button labelled “Close Settings”.",
            "Edge swipes are invisible to VoiceOver — the header must also offer buttons to open both drawers.",
          ],
          content: ["Title = drawer name (Settings) or the installation name."],
          figma: {
            component: "Drawer (screens: Settings / Installation drawer frames)",
            variants: [
              ["Settings drawer (left)", 'side="left"'],
              ["Installation drawer (right)", 'side="right"'],
            ],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Settings: Story = {};
export const Installation: Story = { args: { side: "right" } };
export const Closed: Story = {
  args: { startOpen: false },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Open Settings" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close Settings", hidden: true })).toBeTruthy(),
    );
  },
};
