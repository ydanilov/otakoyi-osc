import demoJson from "@osc/schema/examples/demo-installation.json";
import tryJson from "@osc/schema/examples/try-the-demo.json";
import { parseConfig } from "@osc/schema";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { View } from "react-native";
import { expect } from "storybook/test";
import { ControlServicesProvider } from "../platform/services";
import { componentDocs } from "../stories/docs";
import { storyServices } from "../stories/services";
import { PultPager, PultProvider } from "./PultRenderer";
import { PultStore } from "./store";

function Demo({
  pultIndex = 0,
  height = 700,
  config = "sample",
}: {
  pultIndex?: number;
  height?: number;
  /** `sample`: every control type; `try`: the Figma "Try the demo" installation (panels). */
  config?: "sample" | "try";
}) {
  const store = React.useMemo(() => {
    const parsed = parseConfig(config === "try" ? tryJson : demoJson);
    if (!parsed.ok) throw new Error("demo config invalid");
    const pult = parsed.config.pults[pultIndex] ?? parsed.config.pults[0]!;
    return new PultStore(parsed.config, pult, { send: () => {} });
  }, [pultIndex, config]);
  const services = React.useMemo(storyServices, []);
  return (
    <View style={{ height }}>
      <ControlServicesProvider value={services}>
        <PultProvider store={store}>
          <PultPager pages={store.pult.pages} />
        </PultProvider>
      </ControlServicesProvider>
    </View>
  );
}

const meta = {
  title: "Pult/Pult Pager",
  component: Demo,
  args: { pultIndex: 0, height: 700 },
  parameters: {
    layout: "fullscreen",
    docs: {
      story: { inline: false, height: "720px" },
      description: {
        component: componentDocs({
          purpose:
            "The pult body: renders a config's pages from the control registry. Pages never scroll; they split into horizontally swiped screens (ADR-006).",
          use: [
            "The pult screen, under the Pult Header, with Settings / Installation presented over it.",
          ],
          avoid: ["Anything that is not a config page."],
          do: ["Review the phone viewport too — the grid re-flows for phones."],
          dont: ["Don't wrap it in a ScrollView."],
          anatomy: [
            "Screen tabs (when a page splits)",
            "Horizontal pager (the screen on show and its neighbours are mounted)",
            "Grid of controls and Console-Panel patterns (12 columns, rows stretch to the height)",
            "Panels: Fader Bank, Knob Group, Knob Row, Layer Toggles, Camera Control, Scene Bar, Show Actions, List — max width 640 / 480 / 560, centred when capped, never shorter than their content",
          ],
          behaviour: [
            "Controls are packed from the top at their Figma heights (phone 18 pt gaps, free space below; tablet 16 pt gaps, each column's last item to the bottom); a page that does not fit splits into screens (`layoutPage`, unit-tested, ADR-006).",
            "Phones re-flow controls to half/full width (`reflowForPhone`).",
            "Controls read/write the PultStore; view-only disables them.",
          ],
          a11y: ["Each control carries its own role; the pager is swipeable and tabbable."],
          content: ["Page titles ≤ 12 characters (tabs)."],
          figma: { component: "Screens / client pages (ADR-014 exporter input)" },
        }),
      },
    },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DemoPult: Story = {};
export const Phone: Story = { globals: { viewport: { value: "phone" } } };
/** The demo's live pult: picture pad, compact knobs and sized pads. */
export const LivePult: Story = { args: { pultIndex: 2 } };

/** Figma Demo › Tablet / 03 Demo pult: the VJ console's Mix page from Console-Panel patterns. */
export const PanelsVjConsole: Story = {
  name: "Panels · VJ console (Try the demo)",
  args: { config: "try", pultIndex: 0, height: 640 },
  globals: { viewport: { value: "tablet" } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId("panel-mix")).toBeTruthy();
    await expect(canvas.getByTestId("panel-shape")).toBeTruthy();
    await expect(canvas.getByText("Layer 3")).toBeTruthy();
  },
};
/** Figma Demo › Phone / 03 Demo pult: the Lobby wall's Live page (switches as a List panel). */
export const PanelsLobbyPhone: Story = {
  name: "Panels · Lobby wall (phone)",
  args: { config: "try", pultIndex: 2, height: 640 },
  globals: { viewport: { value: "phone" } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("switch", { name: "Live data" })).toBeTruthy();
  },
};
