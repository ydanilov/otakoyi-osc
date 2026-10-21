import { describe, expect, it } from "vitest";
import {
  dialogPresentation,
  drawerStaysOpen,
  drawerWidth,
  edgeSwipeOpens,
  formatStepped,
  holdFraction,
  parseValueInput,
  snapToStep,
  stepDecimals,
  stepValue,
  trackPosition,
  uploadLabel,
} from "./logic";
import { componentDocs } from "../stories/docs";

describe("stepper", () => {
  const r = { min: 15, max: 30, step: 0.5 };
  it("derives decimals from the step", () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
  });
  it("steps, snaps and clamps without float noise", () => {
    expect(stepValue(22, 1, r)).toBe(22.5);
    expect(stepValue(15, -1, r)).toBe(15);
    expect(stepValue(30, 1, r)).toBe(30);
    expect(stepValue(0.2, 1, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
    expect(snapToStep(22.3, r)).toBe(22.5);
  });
  it("formats with the step's decimals", () => {
    expect(formatStepped(22, 0.5)).toBe("22.0");
    expect(formatStepped(1, 0.1)).toBe("1.0");
    expect(formatStepped(3, 1)).toBe("3");
  });
});

describe("value input", () => {
  it("accepts dot and comma decimals", () => {
    expect(parseValueInput("12.5", {})).toEqual({ ok: true, value: 12.5, clamped: false });
    expect(parseValueInput(" 0,5 ", {})).toEqual({ ok: true, value: 0.5, clamped: false });
  });
  it("clamps to min/max and reports it", () => {
    expect(parseValueInput("9999", { min: 0, max: 1000 })).toEqual({
      ok: true,
      value: 1000,
      clamped: true,
    });
    expect(parseValueInput("-4", { min: 0 })).toEqual({ ok: true, value: 0, clamped: true });
  });
  it("snaps to the step", () => {
    expect(parseValueInput("251", { min: 0, max: 1000, step: 10 })).toMatchObject({ value: 250 });
  });
  it("rejects empty and non-numeric text", () => {
    expect(parseValueInput("", {})).toEqual({ ok: false, reason: "empty" });
    expect(parseValueInput("abc", {})).toEqual({ ok: false, reason: "nan" });
    expect(parseValueInput("1.2.3", {})).toEqual({ ok: false, reason: "nan" });
  });
});

describe("dialogs and drawers", () => {
  it("uses a bottom sheet on phones and a centred modal on tablets", () => {
    expect(dialogPresentation(390)).toBe("sheet");
    expect(dialogPresentation(1180)).toBe("modal");
  });
  it("sizes drawers to the window", () => {
    expect(drawerWidth(390)).toBe(332);
    expect(drawerWidth(1180)).toBe(380);
  });
  it("closes a drawer after a flick or a third of its width", () => {
    expect(drawerStaysOpen(50, 0, 330)).toBe(true);
    expect(drawerStaysOpen(120, 0, 330)).toBe(false);
    expect(drawerStaysOpen(10, 900, 330)).toBe(false);
    expect(drawerStaysOpen(200, -900, 330)).toBe(true);
    expect(edgeSwipeOpens(40, 800, 330)).toBe(true);
    expect(edgeSwipeOpens(40, 0, 330)).toBe(false);
  });
});

describe("media and actions", () => {
  it("computes hold progress", () => {
    expect(holdFraction(750, 1500)).toBe(0.5);
    expect(holdFraction(2000, 1500)).toBe(1);
    expect(holdFraction(10, 0)).toBe(1);
  });
  it("labels upload progress", () => {
    expect(uploadLabel(0.64)).toBe("64%");
    expect(uploadLabel(0.64, 3_300_000)).toBe("64% · 2.1 / 3.3 MB");
  });
  it("maps a touch to a track position", () => {
    expect(trackPosition(50, 200)).toBe(0.25);
    expect(trackPosition(-5, 200)).toBe(0);
    expect(trackPosition(10, 0)).toBe(0);
  });
});

describe("componentDocs", () => {
  it("renders every section and the Figma mapping table", () => {
    const md = componentDocs({
      purpose: "P.",
      use: ["u"],
      do: ["d"],
      dont: ["n"],
      a11y: ["a"],
      figma: {
        component: "Button",
        node: "10:19",
        variants: [["Variant=Primary", 'variant="primary"']],
      },
    });
    expect(md).toContain("### When to use");
    expect(md).toContain("**Don't:** n");
    expect(md).toContain("node-id=10-19");
    expect(md).toContain('| `Variant=Primary` | `variant="primary"` |');
    expect(md).not.toContain("### Anatomy");
  });
});
