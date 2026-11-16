import { parseConfig } from "@osc/schema";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as React from "react";
import { View } from "react-native";
import { expect } from "storybook/test";
import { PultProvider } from "../pult/context";
import { PultStore } from "../pult/store";
import { componentDocs } from "../stories/docs";
import { SetupScreen } from "./Setup";

const CONTROLS = [
  {
    id: "fps",
    type: "fader",
    label: "Frame rate",
    address: "/setup/fps",
    min: 24,
    max: 120,
    step: 1,
    int: true,
    default: 60,
    orientation: "horizontal",
  },
  { id: "mirror", type: "toggle", label: "Mirror output", address: "/setup/mirror", style: "switch" },
  {
    id: "quality",
    type: "segmented",
    label: "Quality",
    address: "/setup/quality",
    options: [
      { value: 0, label: "Low" },
      { value: 1, label: "Medium" },
      { value: 2, label: "High" },
    ],
  },
] as const;

function Demo({ pages = 1 }: { pages?: 1 | 2 }) {
  const { store, pult } = React.useMemo(() => {
    const cells = (w: number) =>
      Object.fromEntries(CONTROLS.map((c, i) => [c.id, { x: 0, y: i * 2, w, h: 2 }]));
    const page = (id: string, title: string, controls: readonly (typeof CONTROLS)[number][]) => ({
      id,
      title,
      controls,
      layout: {
        phone: Object.fromEntries(Object.entries(cells(12)).filter(([k]) => controls.some((c) => c.id === k))),
        tablet: Object.fromEntries(Object.entries(cells(4)).filter(([k]) => controls.some((c) => c.id === k))),
      },
    });
    const setupPages =
      pages === 1
        ? [page("setup", "Setup", CONTROLS)]
        : [page("output", "Output", CONTROLS.slice(0, 2)), page("render", "Render", CONTROLS.slice(2))];
    const parsed = parseConfig({
      schemaVersion: 2,
      installation: { id: "setup-story", name: "Setup story", revision: 1 },
      targets: [{ id: "td", name: "TD", protocol: "udp", host: "auto", port: 7000 }],
      pults: [
        { id: "main", name: "Main", pages: [page("main", "Main", CONTROLS.slice(0, 1))] },
        { id: "setup", name: "Setup", placement: "installation", pages: setupPages },
      ],
    });
    if (!parsed.ok) throw new Error("setup story config invalid");
    const p = parsed.config.pults[1]!;
    return { store: new PultStore(parsed.config, p, { send: () => {} }), pult: p };
  }, [pages]);
  return (
    <PultProvider store={store}>
      <View style={{ width: 358 }}>
        <SetupScreen pages={pult.pages} />
      </View>
    </PultProvider>
  );
}

const meta = {
  title: "Patterns/Setup Screen",
  component: Demo,
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          purpose:
            "The one-off parameters of an installation (TouchDesigner `[setup]`): set once on site, then left alone. Lives in the Installation panel below System, so they never take space on the pult.",
          use: ["Installation panel › Setup, when the config has a pult with `placement: \"installation\"`."],
          avoid: [
            "Show controls — anything an operator changes during a show belongs on the pult ([live] or [tune]).",
            "The four standard System parameters — they have their own System screen.",
          ],
          do: ["Keep one section per TouchDesigner page; caption sections only when there are several."],
          dont: ["Don't put a Setup pult in the pult switcher or the pager."],
          anatomy: [
            "One section per page of the Setup pult (captioned only when there are several)",
            "Its controls stacked one per row at their natural height",
          ],
          behaviour: [
            "Values, lease, echo and activity work as on any pult (the Setup pult has its own store on the bridge).",
            "In a sheet or inspector the list may scroll; the pult screen never does.",
            "Without control every control is disabled but shows its value.",
          ],
          a11y: ["See each control's own page."],
          content: ["Labels come from the TouchDesigner parameter labels, like any pult control."],
          figma: {
            component: "Setup Screen (Patterns)",
            variants: [["(one panel per page)", "pages"]],
          },
        }),
      },
    },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnePage: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId("setup-screen")).toBeTruthy();
    await expect(await canvas.findByText("Frame rate")).toBeVisible();
    await expect(await canvas.findByText("Mirror output")).toBeVisible();
  },
};
export const SeveralPages: Story = {
  args: { pages: 2 },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Output")).toBeVisible();
    await expect(await canvas.findByText("Render")).toBeVisible();
  },
};
