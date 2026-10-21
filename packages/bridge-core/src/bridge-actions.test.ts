import { describe, expect, it } from "vitest";
import { argValue, message, type OscMessage } from "@osc/core";
import type { ServerMessage } from "@osc/protocol";
import { parseConfig, type Target } from "@osc/schema";
import demo from "../../../packages/schema/examples/demo-installation.json";
import { ACTIVITY_SIZE, Bridge, FEEDBACK_TIMEOUT_MS, type LogEntry, type Peer } from "./index";
import type { Supervisor } from "./index";

function setup(edit: (cfg: any) => void = () => {}, supervisor?: Supervisor) {
  const cfg = structuredClone(demo) as any;
  edit(cfg);
  const r = parseConfig(cfg);
  if (!r.ok) throw new Error(JSON.stringify(r));
  let now = 1_000_000;
  const osc: Array<[string, OscMessage]> = [];
  const log: LogEntry[] = [];
  const offline: string[] = [];
  const bridge = new Bridge(
    r.config,
    {
      sendOsc: (t: Target, m) => osc.push(...m.map((x) => [t.id, x] as [string, OscMessage])),
      log: (e) => log.push(e),
      now: () => now,
      supervisor,
      targetOffline: (t) => offline.push(t.id),
    },
    { studioKey: "studio" },
  );
  const peer = (device: string, role: "client" | "studio" = "client", v = 2) => {
    const inbox: ServerMessage[] = [];
    const p: Peer & { inbox: ServerMessage[]; say(m: object): void } = {
      inbox,
      send: (m) => inbox.push(m),
      close: () => {},
      say: (m) => bridge.handle(p, JSON.stringify(m)),
    };
    bridge.connect(p);
    p.say({ t: "hello", v, device, role, ...(role === "studio" ? { secret: "studio" } : {}) });
    return p;
  };
  const sent = () => osc.map(([, m]) => [m.address, ...m.args.map(argValue)]);
  const last = (p: { inbox: ServerMessage[] }, t: ServerMessage["t"]) =>
    [...p.inbox].reverse().find((m) => m.t === t);
  return { bridge, osc, sent, log, offline, peer, last, advance: (ms: number) => (now += ms) };
}

describe("installation actions and modes", () => {
  it("welcome carries supported actions, modes and recent activity; v1 pults still connect", () => {
    const { peer } = setup();
    const a = peer("a", "client", 1);
    const w = a.inbox[0];
    if (w?.t !== "welcome") throw new Error("no welcome");
    expect(w.v).toBe(2);
    expect(w.actions).toEqual(["flash", "restart", "blackout", "idle"]);
    expect(w.modes).toEqual({ blackout: false, idle: false, pause: false });
    expect(Array.isArray(w.activity)).toBe(true);
    const b = peer("b", "client", 3);
    expect(b.inbox[0]).toMatchObject({ t: "error", code: "version" });
  });

  it("flash and restart send one-shot system OSC; restart also goes through the supervisor", async () => {
    const restarted: string[] = [];
    const sup: Supervisor = {
      start: async () => {},
      stop: async () => {},
      restart: async (t) => {
        restarted.push(t.id);
      },
      heartbeat: () => {},
      status: () => "running",
    };
    const { peer, sent, log } = setup((c) => {
      c.targets[0].runtime = { app: "touchplayer", project: "x.toe" };
    }, sup);
    const a = peer("a");
    a.say({ t: "action", name: "flash" });
    a.say({ t: "action", name: "restart" });
    expect(sent()).toEqual([["/otakoyi/flash"], ["/otakoyi/restart"]]);
    expect(restarted).toEqual(["td"]);
    expect(log.filter((e) => e.event === "action").map((e) => e.name)).toEqual([
      "flash",
      "restart",
    ]);
  });

  it("blackout and idle latch, are broadcast in status and logged", () => {
    const { peer, sent, last, log } = setup();
    const a = peer("a");
    const b = peer("b");
    a.say({ t: "action", name: "blackout", on: true });
    a.say({ t: "mode", mode: "idle", on: true });
    expect(sent()).toEqual([
      ["/otakoyi/blackout", 1],
      ["/otakoyi/idle", 1],
    ]);
    expect(last(b, "status")).toMatchObject({
      modes: { blackout: true, idle: true, pause: false },
    });
    a.say({ t: "mode", mode: "idle", on: false });
    expect(sent().at(-1)).toEqual(["/otakoyi/idle", 0]);
    expect(log.filter((e) => e.event === "mode")).toHaveLength(2);
    a.say({ t: "action", name: "blackout" }); // blackout needs on
    expect(last(a, "error")).toMatchObject({ code: "bad-message" });
  });

  it("only the lease holder or the studio; only supported actions", () => {
    const { peer, sent, last } = setup((c) => {
      c.installation.actions = ["flash", "pause"];
    });
    const a = peer("a");
    const b = peer("b");
    b.say({ t: "action", name: "flash" });
    expect(last(b, "error")).toMatchObject({ code: "no-lease" });
    a.say({ t: "action", name: "restart" });
    expect(last(a, "error")).toMatchObject({ code: "unsupported" });
    a.say({ t: "mode", mode: "idle", on: true });
    expect(last(a, "error")).toMatchObject({ code: "unsupported" });
    a.say({ t: "mode", mode: "pause", on: true });
    const s = peer("s", "studio");
    s.say({ t: "action", name: "flash" }); // studio without the lease: allowed
    expect(sent()).toEqual([["/otakoyi/pause", 1], ["/otakoyi/flash"]]);
  });

  it("re-sends latched modes when a target comes back online, and reports it going offline", () => {
    const { peer, bridge, sent, offline, advance } = setup();
    const a = peer("a");
    a.say({ t: "action", name: "blackout", on: true });
    bridge.feedback("td", message("/sys/fps", 60));
    bridge.tick();
    expect(sent()).toContainEqual(["/otakoyi/blackout", 1]);
    expect(sent().filter((m) => m[0] === "/otakoyi/blackout")).toHaveLength(2);
    expect(sent()).toContainEqual(["/otakoyi/idle", 0]);
    advance(FEEDBACK_TIMEOUT_MS + 1);
    bridge.tick();
    expect(offline).toEqual(["td"]);
  });
});

describe("heartbeat", () => {
  it("pings every target once per tick at its heartbeat address; false turns it off", () => {
    const { bridge, sent } = setup();
    bridge.tick();
    bridge.tick();
    expect(sent().filter((m) => m[0] === "/sys/ping")).toHaveLength(2);
    const off = setup((c) => {
      c.targets[0].heartbeat = false;
    });
    off.bridge.tick();
    expect(off.sent().filter((m) => m[0] === "/sys/ping")).toHaveLength(0);
    const custom = setup((c) => {
      c.targets[0].heartbeat = "/alive";
    });
    custom.bridge.tick();
    expect(custom.sent()).toContainEqual(["/alive"]);
  });

  it("any feedback counts as alive and reaches the supervisor", () => {
    const beats: string[] = [];
    const sup: Supervisor = {
      start: async () => {},
      stop: async () => {},
      restart: async () => {},
      heartbeat: (id) => beats.push(id),
      status: () => "running",
    };
    const { bridge } = setup(() => {}, sup);
    bridge.feedback("td", message("/anything", 1));
    expect(beats).toEqual(["td"]);
    expect(bridge.status()[0]!.online).toBe(true);
  });
});

describe("activity feed", () => {
  it("records connect, lease, set (one line per burst) and action, and batches broadcasts per tick", () => {
    const { peer, bridge, last, advance } = setup();
    const a = peer("a");
    const b = peer("b");
    for (let i = 0; i < 20; i++) {
      a.say({ t: "set", pult: "lobby", id: "intensity", value: i / 20 });
      advance(50);
    }
    a.say({ t: "action", name: "flash" });
    const events = bridge.activity().map((e) => e.event);
    expect(events).toEqual(["connect", "lease", "connect", "set", "action"]);
    expect(bridge.activity().find((e) => e.event === "set")).toMatchObject({ value: 0.95 });
    bridge.tick();
    const batch = last(b, "activity");
    if (batch?.t !== "activity") throw new Error("no activity batch");
    expect(batch.entries.map((e) => e.event)).toEqual(events);
    bridge.tick();
    expect(b.inbox.filter((m) => m.t === "activity")).toHaveLength(1); // nothing new, nothing sent
  });

  it("keeps a bounded ring", () => {
    const { peer, bridge } = setup();
    const a = peer("a");
    for (let i = 0; i < ACTIVITY_SIZE + 50; i++) a.say({ t: "action", name: "flash" });
    expect(bridge.activity()).toHaveLength(ACTIVITY_SIZE);
    expect(bridge.activity(10)).toHaveLength(10);
  });
});
