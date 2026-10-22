import demoJson from "@osc/schema/examples/demo-installation.json";
import { parseConfig } from "@osc/schema";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { View } from "react-native";
import { ControlServicesProvider } from "../platform/services";
import { componentDocs } from "../stories/docs";
import { storyServices } from "../stories/services";
import { PultPager, PultProvider } from "./PultRenderer";
import { PultStore } from "./store";

function Demo({ pultIndex = 0, height = 700 }: { pultIndex?: number; height?: number }) {
  const store = React.useMemo(() => {
    const parsed = parseConfig(demoJson);
    if (!parsed.ok) throw new Error("demo config invalid");
    const pult = parsed.config.pults[pultIndex] ?? parsed.config.pults[0]!;
    return new PultStore(parsed.config, pult, { send: () => {} });
  }, [pultIndex]);
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
            "Horizontal pager",
            "Grid of controls (12 columns, rows stretch to the height)",
          ],
          behaviour: [
            "Rows fill the height; below the 40 pt minimum row height a page splits (`paginate`, unit-tested).",
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
