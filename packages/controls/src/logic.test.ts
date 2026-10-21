import { describe, expect, it, vi } from "vitest";
import { encodeMessage } from "@osc/core";
import { parseConfig, type Control } from "@osc/schema";
import demo from "../../schema/examples/demo-installation.json";
import {
  createThrottle,
  faderPosition,
  formatValue,
  gridCellAddress,
  holdProgress,
  hsvToHex,
  initialValue,
  knobAngle,
  messagesFor,
  meterLevel,
  positionToValue,
  rgbToHsv,
  valueToPosition,
  xyPosition,
} from "./logic";

const parsed = parseConfig(demo);
if (!parsed.ok) throw new Error("demo config invalid");
const all = parsed.config.pults.flatMap((p) => p.pages.flatMap((g) => g.controls)) as Control[];
const get = <T extends Control["type"]>(id: string) =>
  all.find((c) => c.id === id) as Extract<Control, { type: T }>;

describe("value mapping", () => {
  it("maps linear ranges both ways", () => {
    const r = { min: -180, max: 180 };
    expect(positionToValue(0.5, r)).toBe(0);
    expect(valueToPosition(90, r)).toBe(0.75);
  });
  it("applies log curve with fine control at the bottom", () => {
    const r = { min: 0, max: 1, curve: "log" as const };
    expect(positionToValue(0.5, r)).toBe(0.25);
    expect(valueToPosition(0.25, r)).toBeCloseTo(0.5);
  });
  it("steps, rounds and clamps", () => {
    expect(positionToValue(0.33, { min: 0, max: 10, step: 1 })).toBe(3);
    expect(positionToValue(1.4, { min: 0, max: 4 })).toBe(4);
    expect(positionToValue(0.26, { min: 0, max: 127, int: true })).toBe(33);
  });
  it("inverts", () => {
    expect(positionToValue(0, { min: 0, max: 1, invert: true })).toBe(1);
  });
});

describe("gestures", () => {
  it("vertical faders grow upwards", () => {
    expect(faderPosition({ x: 0, y: 300 }, { width: 50, height: 300 }, "vertical")).toBe(0);
    expect(faderPosition({ x: 0, y: -20 }, { width: 50, height: 300 }, "vertical")).toBe(1);
    expect(faderPosition({ x: 25, y: 0 }, { width: 100, height: 40 }, "horizontal")).toBe(0.25);
  });
  it("knob sweeps 270° with the gap at the bottom", () => {
    expect(knobAngle(0)).toBe(-135);
    expect(knobAngle(0.5)).toBe(0);
    expect(knobAngle(1)).toBe(135);
  });
  it("xy y grows upwards", () => {
    expect(xyPosition({ x: 50, y: 0 }, { width: 100, height: 100 })).toEqual({ x: 0.5, y: 1 });
  });
  it("hold progress clamps", () => {
    expect(holdProgress(750, 1500)).toBe(0.5);
    expect(holdProgress(4000, 1500)).toBe(1);
  });
});

describe("throttle", () => {
  it("sends first and last values and coalesces the middle", () => {
    vi.useFakeTimers();
    let t = 0;
    const sent: number[] = [];
    const th = createThrottle<number>(
      10,
      (v) => sent.push(v),
      () => t,
    );
    th.push(1);
    t = 20;
    th.push(2);
    t = 40;
    th.push(3);
    t = 100;
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([1, 3]);
    th.push(4);
    th.flush();
    expect(sent).toEqual([1, 3, 4]);
    vi.useRealTimers();
  });
});

describe("colour", () => {
  it("round-trips hsv", () => {
    for (const hex of ["#C6FF3D", "#3DD6FF", "#FF3D8B", "#000000", "#FFFFFF"]) {
      const [h, s, v] = rgbToHsv([
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ]);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
  });
});

describe("formatting", () => {
  it("formats values with units and templates", () => {
    expect(formatValue(0.6123)).toBe("0.61");
    expect(formatValue(45, { unit: "°" })).toBe("45°");
    expect(formatValue(1.5, { unit: "×" })).toBe("1.50×");
    expect(formatValue(59.94, { format: "{value} fps" })).toBe("59.9 fps");
    expect(formatValue(null)).toBe("—");
  });
  it("classifies meter levels", () => {
    const m = get<"meter">("audio");
    expect(meterLevel(0.5, m)).toBe("normal");
    expect(meterLevel(0.8, m)).toBe("warning");
    expect(meterLevel(0.99, m)).toBe("critical");
  });
  it("fills grid addresses", () => {
    expect(gridCellAddress("/cue/{index}", 1, 2, 4)).toBe("/cue/6");
    expect(gridCellAddress("/pad/{row}/{col}", 1, 2, 4)).toBe("/pad/1/2");
  });
});

describe("messagesFor", () => {
  it("builds wire-valid messages for every sending control in the demo", () => {
    const sample: Record<string, Parameters<typeof messagesFor>[1]> = {
      intensity: 0.5,
      speed: 2,
      position: { x: 0.25, y: 0.75 },
      hue: -90,
      mode: 2,
      logo: true,
      flash: { pressed: true },
      blackout: true,
      scene: "evening",
      pads: { cell: 6, on: true },
      tint: "#3DD6FF",
    };
    for (const [id, value] of Object.entries(sample)) {
      const msgs = messagesFor(get(id), value);
      expect(msgs.length, id).toBeGreaterThan(0);
      for (const m of msgs) expect(() => encodeMessage(m)).not.toThrow();
    }
    expect(messagesFor(get("scene"), "evening")[0]).toEqual({
      address: "/scene",
      args: [
        { type: "i", value: 3 },
        { type: "f", value: 2 }, // crossfade seconds are always float
      ],
    });
    expect(messagesFor(get("pads"), { cell: 6, on: true })[0]!.address).toBe("/cue/6");
    expect(messagesFor(get("mode"), 2)[0]!.args).toEqual([{ type: "s", value: "show" }]);
    expect(
      messagesFor(get("tint"), "#3DD6FF")[0]!.args.map((a) => ("value" in a ? a.value : null)),
    ).toEqual([0.239216, 0.839216, 1]);
  });

  it("button sends press and release; hold-to-confirm only on completion", () => {
    const b = get<"button">("flash");
    expect(messagesFor(b, { pressed: true })[0]!.args).toEqual([{ type: "i", value: 1 }]);
    expect(messagesFor(b, { pressed: false })[0]!.args).toEqual([{ type: "i", value: 0 }]);
    expect(messagesFor(get("blackout"), false)).toEqual([]);
  });

  it("display controls send nothing", () => {
    expect(messagesFor(get("status"), "60")).toEqual([]);
    expect(messagesFor(get("audio"), 0.5)).toEqual([]);
  });

  it("has an initial value for every control", () => {
    for (const c of all) expect(initialValue(c), c.id).not.toBeUndefined();
    expect(initialValue(get("hue"))).toBe(0);
    expect(initialValue(get("speed"))).toBe(1);
  });
});
