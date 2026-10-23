import { describe, expect, it } from "vitest";
import { expandRange, formatOsc, parseDependsOn, parseOsc, plain } from "./annotations";

const DRAFT = "\n*draft — confirm against the installation’s&#32;`otakoyi/osc-contract.json`*";

describe("parseOsc", () => {
  it("reads the canonical form", () => {
    const s = parseOsc("**/wall/brightness** `float 0–1` · absolute · 60 Hz · feedback ✓" + DRAFT);
    expect(s.entries).toEqual([{ address: "/wall/brightness", type: "float", range: [0, 1] }]);
    expect(s).toMatchObject({ rateHz: 60, mode: "absolute", feedback: true, draft: true });
  });

  it("ignores the contract file name in the draft line", () => {
    const s = parseOsc('**/wall/mode** `"ambient" | "react" | "show"` · feedback ✓' + DRAFT);
    expect(s.entries.map((e) => e.address)).toEqual(["/wall/mode"]);
    expect(s.entries[0]!.options).toEqual(["ambient", "react", "show"]);
  });

  it("shares the spec of a comma list", () => {
    const s = parseOsc(
      "**/wall/logo**, **/wall/live-data**, **/wall/audio-react** → `1 | 0` · feedback ✓",
    );
    expect(s.entries.map((e) => [e.address, e.values])).toEqual([
      ["/wall/logo", [1, 0]],
      ["/wall/live-data", [1, 0]],
      ["/wall/audio-react", [1, 0]],
    ]);
  });

  it("keeps a spec per address", () => {
    const s = parseOsc(
      "**/mix/layer/{1–4}/opacity** `float 0–1` · **/mix/layer/{1–4}/on** `1 | 0` · feedback ✓",
    );
    expect(s.entries).toEqual([
      { address: "/mix/layer/{1–4}/opacity", type: "float", range: [0, 1] },
      { address: "/mix/layer/{1–4}/on", values: [1, 0] },
    ]);
  });

  it("reads pairs, negative ranges, spring back and rates", () => {
    const s = parseOsc("**/camera/aim** `x y float −1…1` · springs back · 30 Hz");
    expect(s.entries[0]).toEqual({
      address: "/camera/aim",
      type: "float",
      pair: true,
      range: [-1, 1],
    });
    expect(s).toMatchObject({ springBack: true, rateHz: 30 });
  });

  it("reads counts and single values", () => {
    const s = parseOsc(
      "**/mic/level** `float 0–1`, **/mic/bands** `float×4` (bass…high), **/mic/beat** `1` · 30 Hz",
    );
    expect(s.entries.map((e) => [e.address, e.count, e.values])).toEqual([
      ["/mic/level", undefined, undefined],
      ["/mic/bands", 4, undefined],
      ["/mic/beat", undefined, [1]],
    ]);
  });

  it("reads key=value pairs, crossfade and degrees", () => {
    const s = parseOsc("**/scene** `int 1–4` · crossfade=1.5 · 240° · curve=log default=0.3");
    expect(s.entries[0]).toMatchObject({ type: "int", range: [1, 4] });
    expect(s.crossfade).toBe(1.5);
    expect(s.degrees).toBe(240);
    expect(s.keys).toEqual({ crossfade: "1.5", curve: "log", default: "0.3" });
    expect(parseOsc("**/scene** `int 1–4` + crossfade `float s`").crossfade).toBe(true);
    expect(parseOsc("**/scene** `int 1–4` · crossfade=1.5s · feedback ✓").crossfade).toBe(1.5);
  });

  it("finds plain addresses when nothing is bold", () => {
    const s = parseOsc("/a/b float 0-10, then /c 1 | 0");
    expect(s.entries.map((e) => e.address)).toEqual(["/a/b", "/c"]);
    expect(s.entries[0]!.range).toEqual([0, 10]);
    expect(s.entries[1]!.values).toEqual([1, 0]);
  });
});

describe("parseDependsOn", () => {
  it("turns `when` lines into conditions and keeps the rest as notes", () => {
    const d = parseDependsOn(
      'when blackout is off\nwhen mode = "show"\nwhen scene = 2\nHidden while Blackout is on.',
    );
    expect(d.conditions).toEqual([
      { control: "blackout", equals: 0 },
      { control: "mode", equals: "show" },
      { control: "scene", equals: 2 },
    ]);
    expect(d.notes).toEqual(["Hidden while Blackout is on."]);
  });
});

describe("helpers", () => {
  it("expands index ranges", () => {
    expect(expandRange("/mix/layer/{1–3}/on")).toEqual([
      "/mix/layer/1/on",
      "/mix/layer/2/on",
      "/mix/layer/3/on",
    ]);
    expect(expandRange("/fx/{knob-id}")).toBeUndefined();
  });
  it("decodes Figma markdown entities", () => {
    expect(plain("a&#32;b &lt;x&gt; −1")).toBe("a b <x> -1");
  });
  it("formats what it parses", () => {
    const text = formatOsc({
      address: "/wall/hue",
      type: "float",
      range: [0, 360],
      keywords: ["60 Hz", "feedback ✓"],
    });
    expect(text).toBe("**/wall/hue** `float 0–360` · 60 Hz · feedback ✓");
    expect(parseOsc(text).entries[0]).toEqual({
      address: "/wall/hue",
      type: "float",
      range: [0, 360],
    });
    expect(formatOsc({ address: "/m", options: ["a", "b"] })).toBe('**/m** `"a" | "b"`');
  });
});
