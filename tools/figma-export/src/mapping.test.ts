import { describe, expect, it } from "vitest";
import { mapFrame, slug } from "./mapping";
import type { FNode } from "./snapshot";

let n = 0;
const box = (y = 0, h = 80): [number, number, number, number] => [0, y, 370, h];
const inst = (component: string, extra: Partial<FNode> = {}): FNode => ({
  id: `1:${++n}`,
  name: component,
  type: "INSTANCE",
  component,
  box: box(n * 100),
  ...extra,
});
const osc = (text: string) => [{ category: "OSC", text }];
const frame = (...children: FNode[]): FNode => ({
  id: "0:1",
  name: "Pult",
  type: "FRAME",
  children,
});

describe("mapFrame — controls", () => {
  it("maps Fader variants and annotation", () => {
    const r = mapFrame(
      frame(
        inst("Fader", {
          props: {
            Label: "Brightness",
            Value: "0.60",
            Mode: "Absolute",
            Orientation: "Horizontal",
            State: "Default",
          },
          annotations: osc("**/wall/brightness** `float 0–1` · 60 Hz · feedback ✓ · curve=log"),
        }),
        inst("Fader", {
          name: "drift",
          props: { Label: "Hue drift", Value: "+0.02", Mode: "Relative", Orientation: "Vertical" },
          annotations: osc("**/wall/drift** `float -1–1`"),
        }),
      ),
    );
    expect(r.issues.filter((i) => i.level !== "info")).toEqual([]);
    expect(r.controls.map((c) => c.control)).toEqual([
      {
        id: "brightness",
        type: "fader",
        label: "Brightness",
        address: "/wall/brightness",
        orientation: "horizontal",
        default: 0.6,
        curve: "log",
      },
      {
        id: "drift",
        type: "fader",
        label: "Hue drift",
        address: "/wall/drift",
        mode: "relative",
        min: -1,
      },
    ]);
    expect(r.controls[0]!.idFrom).toBe("label");
    expect(r.controls[1]!.idFrom).toBe("layer");
  });

  it("maps Knob Mode=Color to a hue knob and Size=Compact", () => {
    const r = mapFrame(
      frame(
        inst("Knob", {
          props: { Label: "Hue", Mode: "Color", Size: "Compact" },
          annotations: osc("**/hue** `float 0–360`"),
        }),
      ),
    );
    expect(r.controls[0]!.control).toEqual({
      id: "hue",
      type: "knob",
      label: "Hue",
      address: "/hue",
      mode: "hue",
      size: "compact",
    });
  });

  it("gives each List Row of an annotated List Card its own address", () => {
    const row = (t: string): FNode =>
      inst("List Row", {
        props: { Title: t, Trailing: "Switch" },
        children: [inst("Switch", { props: { State: "On" } })],
      });
    const r = mapFrame(
      frame(
        inst("List Card", {
          annotations: osc("**/a**, **/b** → `1 | 0`"),
          children: [
            {
              id: "s",
              name: "Rows",
              type: "SLOT",
              children: [row("Logo"), inst("Divider"), row("Live data")],
            },
          ],
        }),
      ),
    );
    expect(r.controls.map((c) => c.control)).toEqual([
      { id: "logo", type: "toggle", label: "Logo", address: "/a", style: "switch", default: true },
      {
        id: "live-data",
        type: "toggle",
        label: "Live data",
        address: "/b",
        style: "switch",
        default: true,
      },
    ]);
  });

  it("fills {a–b} templates in order and {…-id} templates with the control id", () => {
    const strip = (i: number): FNode =>
      inst("Channel Strip", {
        children: [
          inst("Fader", { props: { Label: `Layer ${i}`, Mode: "Absolute" } }),
          inst("Group Button", {
            name: "Power",
            props: { Label: "ON", State: i === 2 ? "Off" : "On" },
          }),
        ],
      });
    const r = mapFrame(
      frame(
        inst("Fader Bank", {
          annotations: osc("**/l/{1–2}/opacity** `float 0–1` · **/l/{1–2}/on** `1 | 0`"),
          children: [strip(1), strip(2)],
        }),
        inst("Knob Group", {
          annotations: osc("**/fx/{knob-id}** `float 0–1`"),
          children: [inst("Knob", { props: { Label: "Speed" } })],
        }),
      ),
    );
    expect(r.controls.map((c) => [c.control.id, c.control.address])).toEqual([
      ["layer-1", "/l/1/opacity"],
      ["power-1", "/l/1/on"],
      ["layer-2", "/l/2/opacity"],
      ["power-2", "/l/2/on"],
      ["speed", "/fx/speed"],
    ]);
    expect(r.controls[3]!.control.default).toBeUndefined();
    expect(r.controls[1]!.control.label).toBe("Power");
    expect(r.issues.map((i) => i.code)).toContain("id-suffixed");
  });

  it("builds a button group from Group Buttons", () => {
    const gb = (l: string, c: string, s: string) =>
      inst("Group Button", { props: { Label: l, Caption: c, showCaption: true, State: s } });
    const r = mapFrame(
      frame(
        inst("Console Panel", {
          props: { Title: "LAYERS" },
          annotations: osc("**/layers/{name}** `1 | 0` · multi-select"),
          children: [
            inst("Button Group", {
              children: [gb("LOGO", "BRAND", "Off"), gb("DATA", "LIVE FEED", "On")],
            }),
          ],
        }),
      ),
    );
    expect(r.controls[0]!.control).toEqual({
      id: "layers",
      type: "buttonGroup",
      buttons: [
        { id: "logo", label: "Logo", caption: "Brand", address: "/layers/logo" },
        { id: "data", label: "Data", caption: "Live feed", address: "/layers/data" },
      ],
      default: ["data"],
    });
    expect(r.controls[0]!.idFrom).toBe("panel");
  });

  it("maps segmented options, scene bars and icon labels", () => {
    const cells = (...icons: string[]): FNode => ({
      id: "o",
      name: "Options",
      type: "FRAME",
      children: icons.map((i, k) => ({
        id: `c${k}`,
        name: "Frame",
        type: "FRAME",
        children: [inst(`Icon/${i}`)],
      })),
    });
    const r = mapFrame(
      frame(
        inst("Segmented", {
          props: { Content: "Icon" },
          annotations: osc('**/mode** `"ambient" | "show"`'),
          children: [
            { id: "t", name: "Label", type: "TEXT", text: "Mode" },
            cells("sun", "moon", "star"),
          ],
        }),
        inst("Scene Bar", {
          annotations: osc("**/scene** `int 1–2` · crossfade=2"),
          children: [inst("Segmented", { children: [cells("sun", "circle-half")] })],
        }),
      ),
    );
    expect(r.controls.map((c) => c.control)).toEqual([
      {
        id: "mode",
        type: "segmented",
        label: "Mode",
        address: "/mode",
        options: [
          { label: "Ambient", value: "ambient", icon: "sun" },
          { label: "Show", value: "show", icon: "moon" },
        ],
      },
      {
        id: "segmented",
        type: "sceneList",
        address: "/scene",
        scenes: [
          { id: "sun", label: "Sun", value: 1 },
          { id: "circle-half", label: "Circle half", value: 2 },
        ],
        crossfade: 2,
      },
    ]);
    expect(r.issues.find((i) => i.code === "option-count")?.level).toBe("warning");
  });

  it("maps Mic outputs, Thumbstick and a prompt with its mix", () => {
    const r = mapFrame(
      frame(
        inst("Mic", {
          props: { Label: "Room" },
          annotations: osc(
            "**/mic/level** `float 0–1`, **/mic/bands** `float×4`, **/mic/beat** `1` · 30 Hz",
          ),
        }),
        inst("Thumbstick", {
          name: "aim",
          annotations: osc("**/camera/aim** `x y float −1…1` · 20 Hz"),
        }),
        inst("Prompt Presets", {
          annotations: osc("**/p** `string` · applied ✓ **/p/applied**"),
          children: [inst("Console Panel", { props: { Title: "PROMPTS" } })],
        }),
        inst("Prompt Mix", { annotations: osc("**/p/mix** `float 0–1`") }),
      ),
    );
    expect(r.controls.map((c) => c.control)).toEqual([
      {
        id: "room",
        type: "mic",
        label: "Room",
        address: "/mic",
        outputs: ["level", "bands", "beat"],
        bands: 4,
      },
      { id: "aim", type: "thumbstick", address: "/camera/aim", rateHz: 20 },
      { id: "prompts", type: "prompt", label: "Prompts", address: "/p", blend: true },
    ]);
    expect(r.issues.filter((i) => i.level === "warning")).toEqual([]);
  });

  it("turns Depends on conditions into enabledWhen and prose into notes", () => {
    const r = mapFrame(
      frame(
        inst("Pad", {
          props: { Label: "Flash" },
          annotations: [
            ...osc("**/flash**"),
            { category: "Depends on", text: "when blackout is off\nOnly for the studio." },
          ],
        }),
      ),
    );
    expect(r.controls[0]!.control.enabledWhen).toEqual([{ control: "blackout", equals: 0 }]);
    expect(r.issues.find((i) => i.code === "depends-on-note")?.message).toContain(
      "Only for the studio.",
    );
  });

  it("reads the Inspector's shared plugin data when there is no annotation", () => {
    const r = mapFrame(
      frame(
        inst("Toggle", {
          props: { Label: "Logo", Size: "Compact" },
          plugin: { osc: "**/logo** `1 | 0`" },
        }),
      ),
    );
    expect(r.controls[0]!.control).toEqual({
      id: "logo",
      type: "toggle",
      label: "Logo",
      address: "/logo",
      size: "compact",
    });
  });
});

describe("mapFrame — reporting", () => {
  it("reports a control without an address and leaves it out", () => {
    const r = mapFrame(frame(inst("Fader", { props: { Label: "Zoom" } })));
    expect(r.controls).toEqual([]);
    expect(r.issues).toMatchObject([{ level: "error", code: "missing-address" }]);
  });

  it("warns about unknown components and still looks inside", () => {
    const r = mapFrame(
      frame(
        inst("Fancy Panel", {
          children: [inst("Pad", { props: { Label: "Go" }, annotations: osc("**/go**") })],
        }),
      ),
    );
    expect(r.issues.map((i) => [i.level, i.code])).toEqual([["warning", "unknown-component"]]);
    expect(r.controls[0]!.control).toMatchObject({ type: "button", address: "/go" });
  });

  it("skips chrome, hidden layers and Unsupported placeholders", () => {
    const r = mapFrame(
      frame(
        inst("Pult Header"),
        inst("Icon/sun"),
        inst("Pad", { visible: false }),
        inst("Unsupported"),
      ),
    );
    expect(r.controls).toEqual([]);
    expect(r.issues.map((i) => i.code)).toEqual(["unsupported"]);
  });

  it("reports unused annotation addresses and drafts", () => {
    const r = mapFrame(
      frame(
        inst("Pad", {
          props: { Label: "A" },
          annotations: osc("**/a**, **/b**\n*draft — confirm*"),
        }),
      ),
    );
    expect(r.issues.map((i) => i.code)).toEqual(["unused-address"]);
    expect(r.drafts).toHaveLength(1);
  });
});

describe("mapFrame — Color Picker → three addresses", () => {
  const picker = (text: string, name = "Color Picker") =>
    inst("Color Picker", { name, props: { Title: "Colour", Style: "Wheel" }, annotations: osc(text) });

  it("reads <base>/{h,s,b} as the base address with the default hsb format", () => {
    const r = mapFrame(frame(picker("/light/color/{h,s,b} · feedback ✓")));
    expect(r.issues).toEqual([]);
    expect(r.controls[0]!.control).toMatchObject({ type: "colorPicker", address: "/light/color" });
    expect(r.controls[0]!.control.format).toBeUndefined(); // schema default: hsb
  });

  it("takes the three channel addresses as one picker; /h 0–1 means hueRange unit", () => {
    const r = mapFrame(
      frame(
        picker(
          "**/light/color/h** `float 0–1` **/light/color/s** `float 0–1` **/light/color/b** `float 0–1`",
        ),
      ),
    );
    expect(r.issues.filter((i) => i.code === "unused-address")).toEqual([]);
    expect(r.controls[0]!.control).toMatchObject({
      address: "/light/color",
      hueRange: "unit",
    });
  });

  it("keeps degrees for /h 0–360 and a plain base address", () => {
    const deg = mapFrame(frame(picker("**/a/h** `float 0–360` **/a/s** **/a/b**")));
    expect(deg.controls[0]!.control.address).toBe("/a");
    expect(deg.controls[0]!.control.hueRange).toBeUndefined();
    const plainBase = mapFrame(frame(picker("**/wall/tint**")));
    expect(plainBase.controls[0]!.control.address).toBe("/wall/tint");
  });

  it("format=hsvFloat opts into one message; contradicting channel addresses are reported", () => {
    const one = mapFrame(frame(picker("**/vj/colour** · format=hsvFloat")));
    expect(one.controls[0]!.control).toMatchObject({ address: "/vj/colour", format: "hsvFloat" });
    expect(one.issues).toEqual([]);
    const clash = mapFrame(frame(picker("/vj/colour/{h,s,b} · format=hex")));
    expect(clash.issues.map((i) => i.code)).toContain("color-format");
  });
});

describe("slug", () => {
  it("makes schema ids", () => {
    expect(slug("Pan / tilt")).toBe("pan-tilt");
    expect(slug("Live 1")).toBe("live-1");
    expect(slug("Ünïcode ✓")).toBe("unicode");
  });
});

describe("mapFrame — panels and icons", () => {
  it("turns the outermost pattern instance into a panel around its controls", () => {
    const r = mapFrame(
      frame(
        inst("Knob Group", {
          annotations: osc("**/fx/{knob-id}** `float 0–1`"),
          children: [
            inst("Console Panel", {
              props: { Title: "SHAPE" },
              children: [
                inst("Knob", { name: "hue", props: { Label: "Hue" } }),
                inst("Knob", { name: "speed", props: { Label: "Speed" } }),
              ],
            }),
          ],
        }),
        inst("Fader", {
          name: "solo",
          props: { Orientation: "Horizontal" },
          annotations: osc("**/solo** `float 0–1`"),
        }),
      ),
    );
    expect(
      r.panels.map((p) => [p.id, p.pattern, p.title, p.controls.map((c) => c.control.id)]),
    ).toEqual([["shape", "knobGroup", "Shape", ["hue", "speed"]]]);
    expect(r.controls.map((c) => c.control.address)).toEqual(["/fx/hue", "/fx/speed", "/solo"]);
  });

  it("takes a control's own icon, never the component's glyphs", () => {
    const r = mapFrame(
      frame(
        inst("List Card", {
          annotations: osc("**/a**, **/b** → `1 | 0`"),
          children: [
            inst("List Row", {
              props: { Title: "Logo", Trailing: "Switch" },
              children: [inst("Icon/device-mobile"), inst("Icon/caret-right")],
            }),
            inst("List Row", {
              props: { Title: "Data", Trailing: "Switch" },
              children: [inst("Icon/caret-right")],
            }),
          ],
        }),
      ),
    );
    expect(r.controls.map((c) => [c.control.id, c.control.icon, c.control.style])).toEqual([
      ["logo", "device-mobile", "switch"],
      ["data", undefined, "switch"],
    ]);
    expect(r.panels[0]).toMatchObject({ pattern: "list", id: "list-card" });
    expect(r.panels[0]!.title).toBeUndefined();
  });
});
