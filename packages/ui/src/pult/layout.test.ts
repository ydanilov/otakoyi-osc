import { describe, expect, it } from "vitest";
import { baseTokens } from "@osc/tokens";
import type { AnyControl } from "@osc/schema";
import {
  minHeightFor,
  paginate,
  panelMaxWidth,
  panelMinHeight,
  reflowForPhone,
  type Cell,
} from "./layout";

const overlaps = (a: Cell, b: Cell) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("reflowForPhone", () => {
  const controls = [
    { id: "intensity", grid: { x: 0, y: 0, w: 2, h: 6 } },
    { id: "speed", grid: { x: 2, y: 0, w: 2, h: 6 } },
    { id: "xy", grid: { x: 4, y: 0, w: 5, h: 6 } },
    { id: "knob", grid: { x: 9, y: 0, w: 3, h: 3 } },
    { id: "mode", grid: { x: 0, y: 6, w: 6, h: 2 } },
    { id: "flash", grid: { x: 8, y: 6, w: 2, h: 2 } },
  ];
  const out = reflowForPhone(controls.map((c) => [c.id, c.grid] as [string, Cell]));

  it("uses half or full rows and stays inside 12 columns", () => {
    expect(out.get("intensity")!.w).toBe(6);
    expect(out.get("knob")!.w).toBe(6);
    expect(out.get("xy")!.w).toBe(12);
    expect(out.get("mode")!.w).toBe(12);
    expect([out.get("intensity")!.x, out.get("speed")!.x]).toEqual([0, 6]);
    for (const c of out.values()) expect(c.x + c.w).toBeLessThanOrEqual(12);
  });

  it("never overlaps controls", () => {
    const cells = [...out.values()];
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
  });

  it("keeps reading order", () => {
    const y = (id: string) => out.get(id)!.y;
    expect(y("intensity")).toBeLessThanOrEqual(y("xy"));
    expect(y("xy")).toBeLessThanOrEqual(y("mode"));
  });
});

describe("paginate", () => {
  const cells = new Map<string, Cell>([
    ["a", { x: 0, y: 0, w: 6, h: 6 }],
    ["b", { x: 6, y: 0, w: 6, h: 4 }],
    ["c", { x: 6, y: 4, w: 6, h: 3 }], // overlaps a's rows → same band as a and b
    ["d", { x: 0, y: 7, w: 12, h: 2 }],
    ["e", { x: 0, y: 9, w: 6, h: 2 }],
  ]);

  it("keeps a page on one screen when it fits", () => {
    expect(paginate(cells, 20)).toEqual([{ ids: ["a", "b", "c", "d", "e"], top: 0, rows: 11 }]);
  });

  it("splits between bands, never through one", () => {
    const screens = paginate(cells, 9);
    expect(screens.map((s) => s.ids)).toEqual([["a", "b", "c", "d"], ["e"]]);
    expect(screens[1]).toMatchObject({ top: 9, rows: 2 });
  });

  it("gives an oversized band its own screen", () => {
    const screens = paginate(cells, 4);
    expect(screens[0]).toEqual({ ids: ["a", "b", "c"], top: 0, rows: 7 });
    expect(screens.every((s) => s.ids.length > 0)).toBe(true);
  });

  it("returns one empty screen for an empty page", () => {
    expect(paginate(new Map(), 10)).toEqual([{ ids: [], top: 0, rows: 1 }]);
  });
});

describe("picture pads and sized pads", () => {
  const sizes = baseTokens.control;
  const pad = (extra: Record<string, unknown>) =>
    ({
      id: "p",
      type: "toggle",
      style: "button",
      address: "/p",
      ...extra,
    }) as unknown as AnyControl;

  it("knows the Figma sizes", () => {
    expect(minHeightFor(pad({ image: "logo.jpg" }), sizes)).toBe(168);
    expect(minHeightFor(pad({ image: "logo.jpg", size: "compact" }), sizes)).toBe(120);
    expect(minHeightFor(pad({ size: "regular" }), sizes)).toBe(88);
    expect(minHeightFor(pad({ size: "compact" }), sizes)).toBe(64);
    expect(minHeightFor({ ...pad({ size: "compact" }), type: "button" } as AnyControl, sizes)).toBe(
      64,
    );
    // No size: the pad stretches with its cell; switches never use pad sizes.
    expect(minHeightFor(pad({}), sizes)).toBeUndefined();
    expect(minHeightFor(pad({ style: "switch", image: "x.jpg" }), sizes)).toBeUndefined();
  });

  // Rows: header band (2 rows) and a band with a picture pad (2 rows); 8 pt gaps.
  const cells = new Map<string, Cell>([
    ["mode", { x: 0, y: 0, w: 12, h: 2 }],
    ["fader", { x: 0, y: 2, w: 12, h: 2 }],
    ["picture", { x: 0, y: 4, w: 6, h: 2 }],
  ]);

  it("moves a band to the next screen when the rows would squeeze a picture pad", () => {
    // 360 pt / 6 rows ≈ 53 pt rows → the 2-row picture pad gets 114 pt < 168.
    const fit = { height: 360, gap: 8, minHeight: new Map([["picture", 168]]) };
    const screens = paginate(cells, 20, fit);
    expect(screens.map((s) => s.ids)).toEqual([["mode", "fader"], ["picture"]]);
    // On its own screen the band is 2 rows of 176 pt: it fits.
    expect(screens[1]).toMatchObject({ top: 4, rows: 2 });
  });

  it("keeps one screen when there is room", () => {
    const fit = { height: 800, gap: 8, minHeight: new Map([["picture", 168]]) };
    expect(paginate(cells, 20, fit)).toHaveLength(1);
  });

  it("without fit behaves as before", () => {
    expect(paginate(cells, 20)).toHaveLength(1);
  });
});

describe("Console Panel patterns (Figma Patterns, responsive)", () => {
  it("caps the width per pattern", () => {
    expect(panelMaxWidth("faderBank")).toBe(640);
    expect(panelMaxWidth("knobRow")).toBe(480);
    expect(panelMaxWidth("cameraControl")).toBe(480);
    for (const p of [
      "knobGroup",
      "layerToggles",
      "sceneBar",
      "showActions",
      "list",
      "stack",
    ] as const)
      expect(panelMaxWidth(p)).toBe(560);
  });
  it("never gets shorter than its content (Figma heights)", () => {
    expect(panelMinHeight("faderBank", 8)).toBe(466);
    expect(panelMinHeight("knobGroup", 4)).toBe(442);
    expect(panelMinHeight("cameraControl", 2)).toBe(366);
    expect(panelMinHeight("layerToggles", 1)).toBe(136);
    expect(panelMinHeight("sceneBar", 1)).toBe(114);
    expect(panelMinHeight("list", 3)).toBe(170);
  });
  it("moves a band to the next screen rather than squeezing a panel", () => {
    const cells = new Map<string, Cell>([
      ["bank", { x: 0, y: 0, w: 12, h: 6 }],
      ["scene", { x: 0, y: 6, w: 12, h: 2 }],
    ]);
    const minHeight = new Map([
      ["bank", panelMinHeight("faderBank", 8)],
      ["scene", panelMinHeight("sceneBar", 1)],
    ]);
    // 600 pt: 8 rows of 68 — the bank gets 6 rows (448) < 466 → it is squeezed alone on screen 1.
    const s = paginate(cells, 13, { height: 600, gap: 8, minHeight });
    expect(s.map((x) => x.ids)).toEqual([["bank"], ["scene"]]);
  });
});
