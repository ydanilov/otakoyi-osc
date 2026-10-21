import { describe, expect, it } from "vitest";
import { reflowForPhone, type Cell } from "./layout";

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
  const out = reflowForPhone(controls);

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
