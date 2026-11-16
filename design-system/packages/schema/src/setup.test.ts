import { describe, expect, it } from "vitest";
import { allPults, parseConfig, screenPults, setupPults } from "./index";

const page = (id: string, address: string) => ({
  id,
  title: id,
  controls: [{ id: `${id}-a`, type: "fader", label: "A", address }],
  layout: {
    phone: { [`${id}-a`]: { x: 0, y: 0, w: 12, h: 2 } },
    tablet: { [`${id}-a`]: { x: 0, y: 0, w: 4, h: 2 } },
  },
});
const config = (pults: unknown[]) => ({
  schemaVersion: 2,
  installation: { id: "t", name: "Test", revision: 1 },
  targets: [{ id: "td", name: "TD", protocol: "udp", host: "auto", port: 7000 }],
  pults,
});

describe("Setup pults (placement: installation)", () => {
  it("keeps Setup out of the pult screen but serves it like any pult", () => {
    const r = parseConfig(
      config([
        { id: "main", name: "Main", pages: [page("look", "/look/a")] },
        { id: "setup", name: "Setup", placement: "installation", pages: [page("output", "/out/a")] },
      ]),
    );
    if (!r.ok) throw new Error("setup config invalid");
    expect(screenPults(r.config).map((p) => p.id)).toEqual(["main"]);
    expect(setupPults(r.config).map((p) => p.id)).toEqual(["setup"]);
    expect(allPults(r.config).map((p) => p.id)).toEqual(["main", "setup"]);
  });

  it("needs at least one pult on the pult screen", () => {
    const r = parseConfig(
      config([
        { id: "setup", name: "Setup", placement: "installation", pages: [page("o", "/o/a")] },
      ]),
    );
    expect(r.ok).toBe(false);
  });
});
