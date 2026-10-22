import { baseTokens } from "@osc/tokens";
import { describe, expect, it } from "vitest";
import {
  knobLightCenter,
  pinMatches,
  pinPoint,
  touchLightAllowed,
  touchLightMotion,
  touchLightSize,
} from "./touchLight";

const tk = baseTokens.touchLight;

describe("touch light", () => {
  it("sizes the halo per surface and the core as a fraction of it", () => {
    // Pads / buttons: 0.8 × the surface width.
    expect(touchLightSize("surface", 150, tk)).toEqual({ halo: 120, core: 120 * tk.coreScale });
    // Faders: a fixed ~112 px on the thumb, whatever the track length.
    expect(touchLightSize("fader", 999, tk).halo).toBe(112);
    // Knob: ≈1.15 × the disc.
    expect(touchLightSize("knob", 96, tk).halo).toBeCloseTo(110.4);
    // Thumbstick / XY: 116–120.
    const stick = touchLightSize("stick", 0, tk).halo;
    expect(stick).toBeGreaterThanOrEqual(116);
    expect(stick).toBeLessThanOrEqual(120);
    expect(touchLightSize("surface", 100, tk).core).toBeCloseTo(100 * 0.8 * 0.45);
  });

  it("is subtle: halo and core stay at ~20 %", () => {
    expect(tk.haloOpacity).toBeLessThanOrEqual(0.25);
    expect(tk.coreOpacity).toBeLessThanOrEqual(0.25);
  });

  it("has no size for an unmeasured surface", () => {
    expect(touchLightSize("surface", 0, tk)).toEqual({ halo: 0, core: 0 });
    expect(touchLightSize("knob", Number.NaN, tk).halo).toBe(0);
  });

  it("is never shown when disabled or view-only", () => {
    expect(touchLightAllowed(true)).toBe(false);
    expect(touchLightAllowed(false)).toBe(true);
    expect(touchLightAllowed(undefined)).toBe(true);
  });

  it("blooms in 120 ms with scale 0.6 → 1 and fades out in 260 ms", () => {
    expect(touchLightMotion(false, tk)).toEqual({ fromScale: 0.6, inMs: 120, outMs: 260 });
  });

  it("drops the scale under Reduce Motion but keeps the fade", () => {
    const m = touchLightMotion(true, tk);
    expect(m.fromScale).toBe(1);
    expect(m.inMs).toBe(120);
    expect(m.outMs).toBe(260);
  });

  it("offsets the knob light slightly toward the touch, never off the disc", () => {
    const c = { x: 100, y: 100 };
    expect(knobLightCenter(c, c, 48, tk)).toEqual(c);
    const near = knobLightCenter({ x: 110, y: 100 }, c, 48, tk);
    expect(near.y).toBe(100);
    expect(near.x).toBeCloseTo(100 + 10 * tk.knobOffset);
    // Far away: capped at knobOffset × the disc radius.
    const far = knobLightCenter({ x: 100, y: 0 }, c, 48, tk);
    expect(far.x).toBe(100);
    expect(far.y).toBeCloseTo(100 - 48 * tk.knobOffset);
  });

  it("pins at a fraction of the surface, per cell", () => {
    expect(pinPoint({ x: 0.5, y: 0.25 }, 200, 80)).toEqual({ x: 100, y: 20 });
    expect(pinPoint({ x: 2, y: -1 }, 200, 80)).toEqual({ x: 200, y: 0 });
    expect(pinMatches({ x: 0.5, y: 0.5 })).toBe(true);
    expect(pinMatches({ x: 0.5, y: 0.5 }, 1)).toBe(false);
    expect(pinMatches({ x: 0.5, y: 0.5, index: 1 }, 1)).toBe(true);
    expect(pinMatches(null)).toBe(false);
  });
});
