import { describe, expect, it } from "vitest";
import { boxShadow, glowColor } from "./depth";
import { createTheme } from "./theme";

describe("depth", () => {
  it("switches elevation colours with the mode", () => {
    expect(createTheme({ mode: "dark" }).elevation.shadow).toBe("#08090D80");
    expect(createTheme({ mode: "light" }).elevation.highlight).toBe("#FFFFFFCC");
  });

  it("builds the Figma Neu/* effects as box-shadow strings", () => {
    const t = createTheme({ mode: "dark" });
    expect(boxShadow(t, "flat")).toBe("none");
    expect(boxShadow(t, "raised").split(", ")).toHaveLength(5);
    expect(boxShadow(t, "raised")).toContain("8px 12px 28px -4px #08090D80");
    expect(boxShadow(t, "inset")).toBe(
      "inset 4px 4px 10px 0px #05060899, inset -3px -3px 8px 0px #FFFFFF0D",
    );
  });

  it("adds glow only when asked, in the brand signal or a status colour", () => {
    const t = createTheme({ primary: "#FF5A1F" });
    expect(boxShadow(t, "flat", "signal")).toBe(
      "0px 0px 14px 0px #FF5A1F, 0px 0px 4px 0px #FF5A1F",
    );
    expect(boxShadow(t, "pressed", "critical")).toMatch(/^0px 0px 14px 0px #FF4D5E.*inset/);
    expect(boxShadow(t, "raised", false)).not.toContain("#FF5A1F");
    const light = createTheme({ mode: "light" });
    expect(glowColor(light, "signal")).toBe(light.control.fill);
  });
});
