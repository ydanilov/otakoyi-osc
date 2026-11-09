import { describe, expect, it } from "vitest";
import { DebugStore } from "@osc/controls";
import { message } from "@osc/core";
import { parseConfig } from "@osc/schema";
import demo from "../../../../design-system/packages/schema/examples/demo-installation.json";
import { controlRows, debugModel } from "./debug";
import type { SessionState } from "./session";

const parsed = parseConfig(demo);
if (!parsed.ok) throw new Error("demo config");
const cfg = parsed.config;

const state = (p: Partial<SessionState> = {}): SessionState => ({
  connection: "open",
  config: cfg,
  lease: { device: "phone", name: "iPhone", role: "client" },
  targets: [{ id: "td", online: true, lastFeedbackAt: 1000 }],
  modes: { blackout: false, idle: false, pause: false },
  actions: [],
  activity: [],
  error: null,
  lost: false,
  welcomedAt: 0,
  protocol: 2,
  actionError: null,
  ...p,
});

const get = (rows: { label: string; value: string }[], l: string) =>
  rows.find((x) => x.label === l)?.value;

describe("Debug page model", () => {
  it("connection, traffic and versions sections", () => {
    let now = 1000;
    const d = new DebugStore({ now: () => now });
    d.sent("intensity", [message("/wall/brightness", 0.6)]);
    now = 900;
    d.received("/wall/brightness", "0.600");
    now = 1000;
    d.setFps(59.9);
    const t = cfg.targets[0]!;
    now = 1062;
    const m = debugModel(state(), d, { device: "phone", bridge: "ws://192.168.1.40:8080/ws", now });
    expect(get(m.connection, "Bridge")).toBe("192.168.1.40:8080");
    expect(get(m.connection, "Round trip")).toBe("—");
    expect(get(m.connection, "Target")).toBe(
      `${t.id} · ${t.host}:${t.port} ${t.protocol.toUpperCase()}`,
    );
    expect(get(m.connection, "Last feedback")).toBe("62 ms ago");
    expect(get(m.connection, "In control")).toBe("iPhone (you)");
    expect(get(m.traffic, "Sent")).toBe("1 msg/s");
    expect(get(m.traffic, "Received")).toBe("1 msg/s");
    expect(get(m.traffic, "Installation FPS")).toBe("59.9");
    expect(m.versions).toEqual([
      { label: "Protocol", value: "v2" },
      { label: "Config revision", value: String(cfg.installation.revision) },
      { label: "Schema", value: String(cfg.schemaVersion) },
    ]);
    // Newest first.
    expect(m.log.map((l) => `${l.dir} ${l.address} ${l.value}`)).toEqual([
      "in /wall/brightness 0.600",
      "out /wall/brightness 0.600",
    ]);
  });

  it("demo, nobody in control, no feedback", () => {
    const m = debugModel(state({ lease: null, targets: [], protocol: null }), new DebugStore(), {
      device: "phone",
      demo: true,
      now: 0,
    });
    expect(get(m.connection, "Bridge")).toBe("Demo (in-app)");
    expect(get(m.connection, "In control")).toBe("Nobody");
    expect(get(m.connection, "Last feedback")).toBe("—");
    expect(get(m.versions, "Protocol")).toBe("—");
    expect(m.controls).toEqual([]);
  });

  it("keeps the last 50 log lines", () => {
    let now = 0;
    const d = new DebugStore({ now: () => now, logSize: 80 });
    for (let i = 0; i < 70; i++) {
      now = i;
      d.received(`/x/${i}`, "1");
    }
    const m = debugModel(state(), d, { device: "phone", now });
    expect(m.log).toHaveLength(50);
    expect(m.log[0]!.address).toBe("/x/69");
  });

  it("one control row per control: label, address, last value, rate", () => {
    const pult = cfg.pults[0]!;
    const all = pult.pages.flatMap((p) => p.controls).filter((c) => c.type !== "unsupported");
    const d = new DebugStore({ now: () => 1000 });
    const first = all[0]!;
    d.sent(first.id, [message("/x", 0.5)]);
    const rows = controlRows(pult, d);
    expect(rows.map((r) => r.id)).toEqual(all.map((c) => c.id));
    expect(rows[0]).toMatchObject({
      label: first.label ?? first.id,
      value: "0.500",
      rate: "1 msg/s",
    });
    expect(rows[1]).toMatchObject({ value: "—", rate: "—" });
    d.sent(all[1]!.id, [message("/m", "ambient")]);
    expect(controlRows(pult, d)[1]!.value).toBe("ambient");
    expect(debugModel(state(), d, { device: "phone", now: 1000, pult }).controls).toHaveLength(
      all.length,
    );
  });
});
