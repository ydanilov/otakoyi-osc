import { describe, expect, it } from "vitest";
import demo from "../examples/demo-installation.json";
import { CONTROL_TYPES, SCHEMA_VERSION, parseConfig, targetOf } from "./index";

const clone = <T>(v: T): T => structuredClone(v);

describe("parseConfig", () => {
  it("accepts the demo installation and covers every V1 control type", () => {
    const r = parseConfig(demo);
    if (!r.ok) throw new Error(JSON.stringify(r));
    const used = new Set(
      r.config.pults.flatMap((p) => p.pages.flatMap((g) => g.controls.map((c) => c.type))),
    );
    expect([...used].sort()).toEqual([...CONTROL_TYPES].sort());
    expect(CONTROL_TYPES).toHaveLength(12);
  });

  it("fills defaults", () => {
    const r = parseConfig(demo);
    if (!r.ok) throw new Error();
    const fader = r.config.pults[0]!.pages[0]!.controls.find((c) => c.id === "speed");
    expect(fader).toMatchObject({
      type: "fader",
      throttleHz: 60,
      sendOn: "change",
      orientation: "vertical",
      lock: false,
    });
  });

  it("reports a newer schema separately so the app keeps its cached revision", () => {
    expect(parseConfig({ ...clone(demo), schemaVersion: SCHEMA_VERSION + 1 })).toEqual({
      ok: false,
      reason: "newer-schema",
      schemaVersion: SCHEMA_VERSION + 1,
    });
  });

  it("turns an unknown control type into a placeholder instead of failing the pult", () => {
    const cfg = clone(demo) as any;
    cfg.pults[0].pages[0].controls.push({
      id: "future",
      type: "spectrogram",
      grid: { x: 0, y: 9, w: 4, h: 2 },
    });
    const r = parseConfig(cfg);
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.config.pults[0]!.pages[0]!.controls.at(-1)).toEqual({
      id: "future",
      type: "unsupported",
      originalType: "spectrogram",
      grid: { x: 0, y: 9, w: 4, h: 2 },
    });
  });

  it("rejects invalid addresses, unknown targets, duplicates and grid overflow", () => {
    const cfg = clone(demo) as any;
    const controls = cfg.pults[0].pages[0].controls;
    controls[0].address = "wall intensity";
    controls[1].target = "nope";
    controls[2].id = "intensity";
    controls[3].grid = { x: 10, y: 0, w: 4, h: 2 };
    const r = parseConfig(cfg);
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== "invalid") return;
    const msgs = r.issues.map((i) => i.message).join("\n");
    expect(msgs).toMatch(/OSC address/);
    expect(msgs).toMatch(/Unknown target "nope"/);
    expect(msgs).toMatch(/Duplicate control id "intensity"/);
    expect(msgs).toMatch(/overflows/);
  });

  it("blocks a brand that fails contrast", () => {
    const cfg = clone(demo) as any;
    cfg.theme.primary = "#121214";
    const r = parseConfig(cfg);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "invalid")
      expect(r.issues.some((i) => i.path === "theme.primary")).toBe(true);
  });

  it("resolves targets", () => {
    const r = parseConfig(demo);
    if (!r.ok) throw new Error();
    const pult = r.config.pults[0]!;
    expect(targetOf(r.config, pult, pult.pages[0]!.controls[0]!)?.port).toBe(7000);
  });
});
