import { describe, expect, it } from "vitest";
import { message, type OscMessage } from "@osc/core";
import { parseConfig, type Target } from "@osc/schema";
import demo from "../../../schema/examples/demo-installation.json";
import { PultStore } from "./store";

function setup() {
  const r = parseConfig(demo);
  if (!r.ok) throw new Error("demo invalid");
  const sent: Array<{ target: Target; msgs: OscMessage[] }> = [];
  const store = new PultStore(r.config, r.config.pults[0]!, {
    send: (target, msgs) => sent.push({ target, msgs }),
  });
  const control = (id: string) => store.controls().find((c) => c.id === id)!;
  return { store, sent, control };
}

describe("PultStore", () => {
  it("starts every control at its initial value", () => {
    const { store } = setup();
    expect(store.get("speed")).toBe(1);
    expect(store.get("hue")).toBe(0);
    expect(store.get("logo")).toBe(false);
  });

  it("sends OSC to the resolved target on interaction and notifies subscribers", () => {
    const { store, sent, control } = setup();
    let notified = 0;
    store.subscribe("intensity", () => notified++);
    expect(store.interact(control("intensity"), 0.3)).toBe(true);
    expect(store.get("intensity")).toBe(0.3);
    expect(notified).toBe(1);
    expect(sent[0]!.target.port).toBe(7000);
    expect(sent[0]!.msgs[0]!.address).toBe("/wall/intensity");
  });

  it("blocks sending in view-only mode and while the studio holds control", () => {
    const { store, sent, control } = setup();
    for (const mode of ["view", "studio-has-control", "offline"] as const) {
      store.setMode(mode);
      expect(store.interact(control("flash"), { pressed: true })).toBe(false);
    }
    expect(sent).toHaveLength(0);
  });

  it("applies feedback from the installation to the right controls", () => {
    const { store } = setup();
    store.receive(message("/wall/intensity", 0.8));
    store.receive(message("/wall/mode", "react"));
    store.receive(message("/sys/fps", 59.94));
    store.receive(message("/wall/audio/level", 0.5));
    store.receive(message("/wall/logo", 1));
    expect(store.get("intensity")).toBeCloseTo(0.8);
    expect(store.get("mode")).toBe(1);
    expect(store.get("status")).toBe("59.94");
    expect(store.get("audio")).toBe(0.5);
    expect(store.get("logo")).toBe(true);
  });

  it("ignores feedback on unknown addresses", () => {
    const { store } = setup();
    expect(() => store.receive(message("/unknown", 1))).not.toThrow();
  });
});
