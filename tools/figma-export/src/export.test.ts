import { readFileSync } from "node:fs";
import { parseConfig } from "@osc/schema";
import { describe, expect, it } from "vitest";
import { exportSnapshot } from "./export";
import { gridFor } from "./grid";
import { formatReport } from "./report";
import { fetchSnapshot, restNodeToSnapshot } from "./rest";
import { SNAPSHOT_FORMAT, isSnapshot, type FNode, type Snapshot } from "./snapshot";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/template.json", import.meta.url), "utf8"),
) as Snapshot;

const pad = (
  id: string,
  address: string | undefined,
  y: number,
  extra: Partial<FNode> = {},
): FNode => ({
  id: `p-${id}-${y}`,
  name: id,
  type: "INSTANCE",
  component: "Pad",
  box: [0, y, 100, 60],
  props: { Label: id },
  ...(address ? { annotations: [{ category: "OSC", text: `**${address}**` }] } : {}),
  ...extra,
});
const conventionFrame = (name: string, x: number, ...children: FNode[]): FNode => ({
  id: `f-${name}`,
  name,
  type: "FRAME",
  box: [x, 0, 400, 800],
  children,
});
const snap = (...nodes: FNode[]): Snapshot => ({
  format: SNAPSHOT_FORMAT,
  version: 1,
  page: { id: "1:1", name: "Client / lobby" },
  nodes,
});

describe("exportSnapshot — the Template fixture", () => {
  const r = exportSnapshot(fixture);

  it("produces a config that validates against the schema", () => {
    expect(isSnapshot(fixture)).toBe(true);
    expect(r.valid).toBe(true);
    expect(parseConfig(r.config).ok).toBe(true);
  });

  it("finds the pult screens and skips the rest", () => {
    expect(r.summary.pages.map((p) => [p.id, Object.keys(p.frames)])).toEqual([
      ["live", ["phone"]],
      ["prompts", ["phone", "tablet"]],
      ["mix", ["tablet"]],
    ]);
    expect(r.issues.find((i) => i.code === "frame-skipped")?.message).toContain("Mode=View");
  });

  it("reports the real gaps of the page (the template's addresses are the standard set, not drafts)", () => {
    const codes = (l: string) => [
      ...new Set(r.issues.filter((i) => i.level === l).map((i) => i.code)),
    ];
    expect(codes("error")).toEqual([]);
    expect(codes("warning")).toEqual([
      "tab-without-frame",
      "missing-form-factor",
      "not-on-form-factor",
    ]);
  });

  it("exports Console-Panel patterns as page panels, placed instead of their controls", () => {
    type P = {
      id: string;
      panels?: { id: string; title?: string; pattern: string; controls: string[] }[];
      layout: Record<string, Record<string, unknown>>;
    };
    const pages = (r.config.pults as { pages: P[] }[])[0]!.pages;
    const mix = pages.find((p) => p.id === "mix")!;
    expect(mix.panels!.map((p) => [p.id, p.pattern, p.title, p.controls.length])).toEqual([
      ["mix", "faderBank", "Mix", 8],
      ["shape", "knobGroup", "Shape", 4],
      ["layers-panel", "layerToggles", "Layers", 1],
      ["camera", "cameraControl", "Camera", 2],
      ["scene-panel", "sceneBar", "Scene", 1],
    ]);
    expect(Object.keys(mix.layout.tablet!).sort()).toEqual(
      ["camera", "layers-panel", "mix", "scene-panel", "shape"].sort(),
    );
    const live = pages.find((p) => p.id === "live")!;
    expect(live.panels).toEqual([
      { id: "list-card", pattern: "list", controls: ["logo", "live-data", "audio-react"] },
    ]);
  });

  it("exports the primary form factor, control icons and LED toggles", () => {
    const pult = (r.config.pults as Record<string, unknown>[])[0]!;
    expect(pult.formFactor).toBe("phone");
    const controls = (pult.pages as { controls: Record<string, unknown>[] }[]).flatMap(
      (p) => p.controls,
    );
    const byId = (id: string) => controls.find((c) => c.id === id)!;
    expect(byId("logo").icon).toBe("device-mobile");
    expect(byId("audio-react").icon).toBe("waveform");
    expect(byId("power-1").style).toBe("led");
    expect((byId("scene").options as { icon?: string }[]).map((o) => o.icon)).toEqual([
      "lightning",
      "sun",
      "moon",
      "circle-half",
    ]);
  });

  it("takes the theme colours from the page's Figma Brand mode (Aurora)", () => {
    expect(r.config.theme).toEqual({
      primary: "#5CE6C8",
      onPrimary: "#06140F",
      primaryPressed: "#3BBFA3",
      primarySubtle: "#132723",
      accent: "#B7A6FF",
      onAccent: "#0D0A1A",
      primarySignalLight: "#1F8C75",
    });
    const otakoyi = exportSnapshot(fixture, { brand: "Otakoyi" });
    expect((otakoyi.config.theme as { primary: string }).primary).toBe("#8DFF2E");
    const bad = exportSnapshot(fixture, { brand: "Nope" });
    expect(bad.issues.find((i) => i.code === "unknown-brand-mode")?.level).toBe("error");
    const none = exportSnapshot({ ...fixture, brand: undefined }, { brand: "Otakoyi" });
    expect(none.issues.find((i) => i.code === "no-brand-modes")?.level).toBe("error");
  });

  it("is deterministic (config and report snapshots)", async () => {
    expect(JSON.stringify(exportSnapshot(fixture).config)).toBe(JSON.stringify(r.config));
    await expect(JSON.stringify(r.config, null, 2) + "\n").toMatchFileSnapshot(
      "../fixtures/template.config.json",
    );
    await expect(formatReport(r)).toMatchFileSnapshot("../fixtures/template.report.md");
  });
});

describe("exportSnapshot — conventions", () => {
  it("reads <pult> / <form factor> / <page> frames and merges phone + tablet by id", () => {
    const r = exportSnapshot(
      snap(
        conventionFrame(
          "lobby / phone / live",
          0,
          pad("flash", "/flash", 0),
          pad("logo", "/logo", 100),
        ),
        conventionFrame(
          "lobby / tablet / live",
          500,
          pad("flash", undefined, 0),
          pad("logo", undefined, 0, { box: [600, 0, 100, 60] }),
        ),
      ),
      {
        base: {
          installation: { id: "lobby", name: "Lobby" },
          targets: [{ id: "td", name: "TD", port: 7000 }],
        },
      },
    );
    expect(r.valid).toBe(true);
    expect(r.issues.filter((i) => i.level !== "info")).toEqual([]);
    const page = (
      r.config.pults as {
        pages: { controls: { id: string; address: string }[]; layout: Record<string, unknown> }[];
      }[]
    )[0]!.pages[0]!;
    expect(page.controls.map((c) => [c.id, c.address])).toEqual([
      ["flash", "/flash"],
      ["logo", "/logo"],
    ]);
    expect(page.layout).toEqual({
      phone: { flash: { x: 0, y: 0, w: 12, h: 1 }, logo: { x: 0, y: 1, w: 12, h: 1 } },
      tablet: { flash: { x: 0, y: 0, w: 2, h: 1 }, logo: { x: 10, y: 0, w: 2, h: 1 } },
    });
  });

  it("skips state variants, checks the OSC contract and duplicate addresses", () => {
    const r = exportSnapshot(
      snap(
        conventionFrame("lobby / phone / live", 0, pad("a", "/x", 0), pad("b", "/x", 100)),
        conventionFrame("lobby / phone / live", 500, pad("c", "/c", 0)),
      ),
      { contract: { parameters: [{ address: "/layer/{index}" }] } },
    );
    expect(r.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "state-variant",
        "duplicate-address",
        "not-in-contract",
        "missing-form-factor",
      ]),
    );
    const ok = exportSnapshot(
      snap(conventionFrame("lobby / phone / live", 0, pad("a", "/layer/3", 0))),
      {
        contract: { parameters: [{ address: "/layer/{index}" }] },
      },
    );
    expect(ok.issues.map((i) => i.code)).not.toContain("not-in-contract");
  });

  it("a Color Picker exports one control with three channel addresses, checked against the contract", () => {
    const picker: FNode = {
      id: "cp-1",
      name: "light-color",
      type: "INSTANCE",
      component: "Color Picker",
      box: [0, 0, 370, 448],
      props: { Title: "Colour" },
      annotations: [{ category: "OSC", text: "**/light/color/{h,s,b}** · feedback ✓" }],
    };
    const frames = snap(conventionFrame("lobby / phone / live", 0, picker));
    const r = exportSnapshot(frames);
    expect(r.valid).toBe(true);
    const parsed = parseConfig(r.config);
    if (!parsed.ok) throw new Error("invalid");
    const c = parsed.config.pults[0]!.pages[0]!.controls[0]!;
    expect(c).toMatchObject({ type: "colorPicker", address: "/light/color", format: "hsb" });
    const codes = (parameters: { address: string; type?: string }[]) =>
      exportSnapshot(frames, { contract: { parameters } }).issues.map((i) => i.code);
    expect(codes([{ address: "/light/color", type: "color" }])).not.toContain("not-in-contract");
    expect(
      codes(["h", "s", "b"].map((ch) => ({ address: `/light/color/${ch}`, type: "float" }))),
    ).not.toContain("not-in-contract");
    expect(codes([{ address: "/light/color/h", type: "float" }])).toContain("not-in-contract");
  });

  it("bumps the revision when the pults changed", () => {
    const s = snap(conventionFrame("lobby / phone / live", 0, pad("a", "/a", 0)));
    const first = exportSnapshot(s);
    const prev = {
      ...first.config,
      installation: { ...(first.config.installation as object), revision: 4 },
    } as never;
    expect(
      (exportSnapshot(s, { previous: prev }).config.installation as { revision: number }).revision,
    ).toBe(4);
    const changed = snap(conventionFrame("lobby / phone / live", 0, pad("a", "/b", 0)));
    expect(
      (exportSnapshot(changed, { previous: prev }).config.installation as { revision: number })
        .revision,
    ).toBe(5);
  });

  it("carries Depends on conditions into the config (schema enabledWhen)", () => {
    const r = exportSnapshot(
      snap(
        conventionFrame(
          "lobby / phone / live",
          0,
          pad("blackout", "/blackout", 0),
          pad("flash", "/flash", 100, {
            annotations: [
              { category: "OSC", text: "**/flash**" },
              { category: "Depends on", text: "when blackout is off" },
            ],
          }),
        ),
      ),
    );
    expect(r.valid).toBe(true);
    const controls = (r.config.pults as { pages: { controls: Record<string, unknown>[] }[] }[])[0]!
      .pages[0]!.controls;
    expect(controls[1]!.enabledWhen).toEqual([{ control: "blackout", equals: 0 }]);
  });

  it("fails cleanly on a page without pult frames", () => {
    const r = exportSnapshot(snap({ id: "x", name: "Notes", type: "FRAME" }));
    expect(r.valid).toBe(false);
    expect(r.issues[0]!.code).toBe("no-pult-frames");
  });
});

describe("gridFor", () => {
  it("scales edges to 12 columns and rows to a uniform unit without gaps", () => {
    const g = gridFor([
      { id: "a", box: [0, 0, 200, 50] },
      { id: "b", box: [200, 0, 200, 150] },
      { id: "c", box: [0, 300, 400, 50] },
    ]);
    expect(Object.fromEntries(g)).toEqual({
      a: { x: 0, y: 0, w: 6, h: 1 },
      b: { x: 6, y: 0, w: 6, h: 3 },
      c: { x: 0, y: 3, w: 12, h: 1 },
    });
  });
});

describe("REST", () => {
  const doc = {
    id: "36:2",
    name: "Client · Template",
    type: "CANVAS",
    children: [
      {
        id: "1:2",
        name: "lobby / phone / live",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 800 },
        children: [
          {
            id: "1:3",
            name: "flash",
            type: "INSTANCE",
            componentId: "9:1",
            absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 60 },
            componentProperties: {
              "Label#2:1": { type: "TEXT", value: "Flash" },
              Size: { type: "VARIANT", value: "Regular" },
              "Icon#3:3": { type: "INSTANCE_SWAP", value: "7:7" },
            },
            sharedPluginData: { otakoyi: { osc: "**/flash**" } },
            children: [{ id: "1:4", name: "bg", type: "RECTANGLE" }],
          },
        ],
      },
    ],
  };
  const meta = {
    components: { "9:1": { name: "Size=Regular", componentSetId: "9:0" } },
    componentSets: { "9:0": { name: "Pad" } },
  };

  it("converts REST nodes to the snapshot shape", () => {
    const n = restNodeToSnapshot(doc.children[0]!.children[0] as never, meta);
    expect(n).toEqual({
      id: "1:3",
      name: "flash",
      type: "INSTANCE",
      box: [10, 10, 100, 60],
      component: "Pad",
      props: { Label: "Flash", Size: "Regular" },
      plugin: { osc: "**/flash**" },
    });
  });

  it("fetches a page by name and exports it", async () => {
    const calls: string[] = [];
    const fake = async (url: string) => {
      calls.push(url);
      const body = url.includes("/nodes")
        ? { nodes: { "36:2": { document: doc, ...meta } } }
        : { document: { children: [{ id: "36:2", name: "Client · Template" }] } };
      return { ok: true, status: 200, json: async () => body, text: async () => "" };
    };
    const s = await fetchSnapshot({ fileKey: "KEY", page: "Template", token: "t", fetch: fake });
    expect(calls).toEqual([
      "https://api.figma.com/v1/files/KEY?depth=1",
      "https://api.figma.com/v1/files/KEY/nodes?ids=36%3A2&plugin_data=shared",
    ]);
    const r = exportSnapshot(s);
    expect(r.valid).toBe(true);
    expect(
      (r.config.pults as { pages: { controls: unknown[] }[] }[])[0]!.pages[0]!.controls,
    ).toEqual([
      { id: "flash", type: "button", label: "Flash", address: "/flash", size: "regular" },
    ]);
  });
});
