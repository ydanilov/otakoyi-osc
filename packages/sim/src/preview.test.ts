import { describe, expect, it } from "vitest";
import { message } from "@osc/core";
import { parseConfig } from "@osc/schema";
import demo from "../../schema/examples/demo-installation.json";
import { DEMO_BINDINGS, applyToPreview, controlsByAddress } from "./bindings";
import {
  DEFAULT_PREVIEW,
  PREVIEW_BLOBS,
  hsva,
  previewBlobs,
  previewCaption,
  previewLevel,
  previewRate,
  strobeOn,
} from "./preview";

const parsed = parseConfig(demo);
if (!parsed.ok) throw new Error("demo config");
const controls = controlsByAddress(parsed.config);
const apply = (p = DEFAULT_PREVIEW, ...msgs: ReturnType<typeof message>[]) =>
  msgs.reduce((acc, m) => applyToPreview(acc, m, DEMO_BINDINGS, controls), p);
const alpha = (rgba: string) => Number(/,\s*([\d.]+)\)$/.exec(rgba)![1]);

describe("preview model", () => {
  it("brightness scales the light; idle dims it; blackout turns it off", () => {
    const bright = previewBlobs({ ...DEFAULT_PREVIEW, brightness: 1 }, 0);
    const dim = previewBlobs({ ...DEFAULT_PREVIEW, brightness: 0.2 }, 0);
    expect(bright).toHaveLength(PREVIEW_BLOBS);
    expect(alpha(bright[0]!.color)).toBeGreaterThan(alpha(dim[0]!.color));
    expect(previewLevel({ brightness: 0.8, idle: true, blackout: false })).toBeCloseTo(0.28);
    expect(previewLevel({ brightness: 0.8, idle: false, blackout: true })).toBe(0);
    expect(alpha(previewBlobs({ ...DEFAULT_PREVIEW, blackout: true }, 0)[0]!.color)).toBe(0);
  });

  it("hue shifts the palette and speed sets the motion rate (pause freezes it)", () => {
    const a = previewBlobs({ ...DEFAULT_PREVIEW, hue: 0 }, 1)[0]!.color;
    const b = previewBlobs({ ...DEFAULT_PREVIEW, hue: 120 }, 1)[0]!.color;
    expect(a).not.toBe(b);
    expect(previewRate({ speed: 1, pause: false })).toBeGreaterThan(
      previewRate({ speed: 0, pause: false }),
    );
    expect(previewRate({ speed: 1, pause: true })).toBe(0);
    const moved = previewBlobs(DEFAULT_PREVIEW, 2)[0]!;
    const still = previewBlobs(DEFAULT_PREVIEW, 0)[0]!;
    expect(moved.x).not.toBeCloseTo(still.x, 3);
  });

  it("hsva makes rgba strings", () => {
    expect(hsva(0, 1, 1, 1)).toBe("rgba(255, 0, 0, 1)");
    expect(hsva(120, 1, 1, 0.5)).toBe("rgba(0, 255, 0, 0.5)");
    expect(hsva(-120, 1, 1, 1)).toBe("rgba(0, 0, 255, 1)");
  });

  it("strobes at 8 Hz only while the strobe is on", () => {
    expect(strobeOn({ strobe: false, blackout: false }, 0)).toBe(false);
    expect(strobeOn({ strobe: true, blackout: false }, 0)).toBe(true);
    expect(strobeOn({ strobe: true, blackout: false }, 1 / 16)).toBe(false);
    expect(strobeOn({ strobe: true, blackout: true }, 0)).toBe(false);
  });
});

describe("demo bindings: OSC → preview", () => {
  it("maps the demo controls with their ranges and curves", () => {
    expect(apply(undefined, message("/wall/intensity", 1)).brightness).toBe(1);
    expect(apply(undefined, message("/wall/intensity", 0)).brightness).toBe(0);
    // knob/hue is −180…180, centred: 90° → a quarter turn.
    expect(apply(undefined, message("/wall/hue", 90)).hue).toBeCloseTo(90);
    // A colour-wheel knob sends degrees directly.
    expect(apply(undefined, message("/live/color", 200)).hue).toBe(200);
    const focus = apply(undefined, message("/wall/focus", 0.2, 0.9)).focus;
    expect(focus.x).toBeCloseTo(0.2);
    expect(focus.y).toBeCloseTo(0.1); // OSC y is up, the picture's y is down
    expect(apply(undefined, message("/wall/tint", 1, 0, 0)).tint).toEqual([1, 0, 0]);
    expect(apply(undefined, message("/scene", 3)).scene).toBe("Evening");
    expect(apply(undefined, message("/live/prompt/a", "neon rain")).prompt).toBe("neon rain");
  });

  it("system OSC: flash counts, blackout / idle / pause latch, restart un-pauses", () => {
    const p = apply(
      undefined,
      message("/otakoyi/flash"),
      message("/otakoyi/blackout", 1),
      message("/otakoyi/idle", 1),
      message("/otakoyi/pause", 1),
    );
    expect(p).toMatchObject({ flash: 1, blackout: true, idle: true, pause: true });
    const r = apply(p, message("/otakoyi/restart"));
    expect(r).toMatchObject({ restarts: 1, pause: false });
    expect(apply(p, message("/otakoyi/blackout", 0)).blackout).toBe(false);
  });

  it("a hold-to-confirm blackout toggles; a button flashes on press only", () => {
    const on = apply(undefined, message("/wall/blackout", 1));
    expect(on.blackout).toBe(true);
    expect(apply(on, message("/wall/blackout", 1)).blackout).toBe(false);
    expect(apply(undefined, message("/wall/flash", 1), message("/wall/flash", 0)).flash).toBe(1);
  });

  it("ignores addresses it does not know (same object back)", () => {
    expect(apply(DEFAULT_PREVIEW, message("/nope", 1))).toBe(DEFAULT_PREVIEW);
  });

  it("captions: blackout > pause > idle > prompt > scene", () => {
    expect(previewCaption({ ...DEFAULT_PREVIEW, prompt: "x", blackout: true })).toBe("Blackout");
    expect(previewCaption({ ...DEFAULT_PREVIEW, prompt: "x", scene: "Day" })).toBe("“x”");
    expect(previewCaption({ ...DEFAULT_PREVIEW, scene: "Day" })).toBe("Scene · Day");
    expect(previewCaption(DEFAULT_PREVIEW)).toBe("Live");
  });
});
