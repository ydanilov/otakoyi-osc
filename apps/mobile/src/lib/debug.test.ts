import { describe, expect, it } from "vitest";
import { DebugStore } from "@osc/controls";
import { message } from "@osc/core";
import { parseConfig } from "@osc/schema";
import demo from "../../../../packages/schema/examples/demo-installation.json";
import { hudModel } from "./debug";
import type { SessionState } from "./session";

const parsed = parseConfig(demo);
if (!parsed.ok) throw new Error("demo config");

const state = (p: Partial<SessionState> = {}): SessionState => ({
  connection: "open",
  config: parsed.config,
  lease: { device: "phone", name: "iPhone", role: "client" },
  targets: [{ id: "td", online: true, lastFeedbackAt: 1000 }],
  modes: { blackout: false, idle: false, pause: false },
  actions: [],
  activity: [],
  error: null,
  lost: false,
  welcomedAt: 0,
  protocol: 2,
  ...p,
});

describe("debug HUD model", () => {
  it("shows versions, bridge, rates, lease, target and feedback age", () => {
    let now = 1000;
    const d = new DebugStore({ now: () => now });
    d.sent("intensity", [message("/wall/brightness", 0.6)]);
    now = 900;
    d.received("/wall/brightness", "0.600");
    now = 1000;
    d.setFps(59.9);
    const t = parsed.config.targets[0]!;
    now = 1062;
    const m = hudModel(state(), d, { device: "phone", bridge: "ws://192.168.1.40:8080/ws", now });
    expect(m.versions).toBe(
      `proto v2 · rev ${parsed.config.installation.revision} · schema ${parsed.config.schemaVersion}`,
    );
    const get = (l: string) => m.metrics.find((x) => x.label === l)?.value;
    expect(get("bridge")).toBe("ws://192.168.1.40:8080");
    expect(get("rtt")).toBe("—");
    expect(get("out")).toBe("1 msg/s");
    expect(get("in")).toBe("1 msg/s");
    expect(get("fps")).toBe("59.9");
    expect(get("lease")).toBe("iPhone · you");
    expect(get("target")).toContain(`${t.id} ${t.host}:${t.port} ${t.protocol}`);
    expect(get("feedback")).toBe("62 ms ago");
    expect(m.log.map((l) => `${l.dir} ${l.text}`)).toEqual([
      "out /wall/brightness 0.600",
      "in /wall/brightness 0.600",
    ]);
  });

  it("demo and no lease", () => {
    const m = hudModel(state({ lease: null, targets: [] }), new DebugStore(), {
      device: "phone",
      demo: true,
      now: 0,
    });
    const get = (l: string) => m.metrics.find((x) => x.label === l)?.value;
    expect(get("bridge")).toBe("demo (in-app)");
    expect(get("lease")).toBe("none");
    expect(get("feedback")).toBe("—");
  });
});
