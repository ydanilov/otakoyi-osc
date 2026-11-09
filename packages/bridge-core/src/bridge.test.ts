import { describe, expect, it } from "vitest";
import { argValue, decodeMessage, encodeMessage, message, type OscMessage } from "@osc/core";
import type { ServerMessage } from "@osc/protocol";
import { parseConfig } from "@osc/schema";
import demo from "../../../design-system/packages/schema/examples/demo-installation.json";
import { ECHO_WINDOW_MS } from "@osc/controls";
import { Bridge, FEEDBACK_TIMEOUT_MS, type LogEntry, type Peer } from "./index";

function setup(auth = {}) {
  const r = parseConfig(demo);
  if (!r.ok) throw new Error("demo invalid");
  let now = 1_000_000;
  const osc: OscMessage[] = [];
  const log: LogEntry[] = [];
  const bridge = new Bridge(
    r.config,
    { sendOsc: (_t, m) => osc.push(...m), log: (e) => log.push(e), now: () => now },
    auth,
  );
  const peer = (device: string, role: "client" | "studio" = "client", secret?: string) => {
    const inbox: ServerMessage[] = [];
    const p: Peer & { inbox: ServerMessage[]; closed: boolean; say(m: object): void } = {
      inbox,
      closed: false,
      send: (m) => inbox.push(m),
      close: () => {
        p.closed = true;
      },
      say: (m) => bridge.handle(p, JSON.stringify(m)),
    };
    bridge.connect(p);
    p.say({ t: "hello", v: 1, device, role, ...(secret ? { secret } : {}) });
    return p;
  };
  const last = (p: { inbox: ServerMessage[] }, t: ServerMessage["t"]) =>
    [...p.inbox].reverse().find((m) => m.t === t);
  return { bridge, osc, log, peer, last, advance: (ms: number) => (now += ms) };
}

describe("Bridge", () => {
  it("welcomes a device with config, state and the lease", () => {
    const { peer, last } = setup();
    const a = peer("a");
    const w = a.inbox[0];
    expect(w?.t).toBe("welcome");
    if (w?.t !== "welcome") return;
    expect(w.state.lobby?.intensity).toBe(0.6);
    expect(last(a, "lease")).toEqual({ t: "lease", holder: { device: "a", role: "client" } });
  });

  it("runs the System screen as a hidden pult: OSC, clamping, feedback (ADR-018)", () => {
    const { peer, osc, bridge, last } = setup();
    const a = peer("a");
    const b = peer("b");
    const w = a.inbox[0];
    if (w?.t !== "welcome") throw new Error("welcome");
    expect(w.state.system).toEqual({ resw: 1920, resh: 1080, debug: false, seed: 0 });
    a.say({ t: "set", pult: "system", id: "resw", value: 1280.4 });
    a.say({ t: "set", pult: "system", id: "resh", value: 99999 });
    a.say({ t: "set", pult: "system", id: "debug", value: true });
    expect(osc.map((m) => [m.address, m.args[0]!.type, argValue(m.args[0]!)])).toEqual([
      ["/system/resw", "i", 1280],
      ["/system/resh", "i", 16384],
      ["/system/debug", "i", 1],
    ]);
    // The installation reports its real size (e.g. capped by TouchDesigner): every device sees it.
    bridge.feedback("td", message("/system/resw", 1280));
    bridge.feedback("td", message("/system/resh", 720));
    expect(last(b, "value")).toEqual({
      t: "value",
      pult: "system",
      id: "resh",
      value: 720,
      by: null,
    });
  });

  it("sends OSC for the lease holder and syncs every other device", () => {
    const { peer, osc, last } = setup();
    const a = peer("a");
    const b = peer("b");
    a.say({ t: "set", pult: "lobby", id: "intensity", value: 0.25 });
    expect(osc.map((m) => [m.address, argValue(m.args[0]!)])).toEqual([["/wall/intensity", 0.25]]);
    expect(last(b, "value")).toEqual({
      t: "value",
      pult: "lobby",
      id: "intensity",
      value: 0.25,
      by: "a",
    });
    expect(last(a, "value")).toBeUndefined(); // no echo to the sender
  });

  it("rejects a viewer, bad values and display-only controls", () => {
    const { peer, osc, last } = setup();
    peer("a");
    const b = peer("b");
    b.say({ t: "set", pult: "lobby", id: "intensity", value: 0.9 });
    expect(last(b, "error")).toMatchObject({ code: "no-lease" });
    const a2 = peer("a"); // same device reconnects and keeps the lease
    a2.say({ t: "set", pult: "lobby", id: "intensity", value: "max" });
    expect(last(a2, "error")).toMatchObject({ code: "bad-value" });
    a2.say({ t: "set", pult: "lobby", id: "audio", value: 1 });
    expect(last(a2, "error")).toMatchObject({ code: "bad-value" });
    a2.say({ t: "set", pult: "lobby", id: "ghost", value: 1 });
    expect(last(a2, "error")).toMatchObject({ code: "unknown-control" });
    expect(osc).toHaveLength(0);
  });

  it("clamps out-of-range values before they reach the installation", () => {
    const { peer, osc } = setup();
    peer("a").say({ t: "set", pult: "lobby", id: "intensity", value: 40 });
    expect(argValue(osc[0]!.args[0]!)).toBe(1);
  });

  it("lets a client take control, and the studio take it from anyone", () => {
    const { peer, last } = setup({ studioKey: "s3cret" });
    const a = peer("a");
    const b = peer("b");
    b.say({ t: "take" });
    expect(last(a, "lease")).toMatchObject({ holder: { device: "b" } });
    const s = peer("studio", "studio", "s3cret");
    s.say({ t: "take" });
    expect(last(a, "lease")).toMatchObject({ holder: { device: "studio", role: "studio" } });
    b.say({ t: "take" });
    expect(last(b, "error")).toMatchObject({ code: "no-lease" });
    s.say({ t: "release" });
    expect(last(a, "lease")).toMatchObject({ holder: { device: "a" } }); // longest-connected client
  });

  it("hands the lease over when the holder disconnects", () => {
    const { bridge, peer, last } = setup();
    const a = peer("a");
    const b = peer("b");
    bridge.disconnect(a);
    expect(last(b, "lease")).toMatchObject({ holder: { device: "b" } });
  });

  it("checks the PIN and the studio key", () => {
    const { peer, last } = setup({ clientPin: "1234" });
    const wrong = peer("x", "client", "0000");
    expect(last(wrong, "error")).toMatchObject({ code: "auth" });
    expect(wrong.closed).toBe(true);
    const studio = peer("s", "studio", "anything"); // no studio key configured → refused
    expect(studio.closed).toBe(true);
    const ok = peer("y", "client", "1234");
    expect(ok.inbox[0]?.t).toBe("welcome");
  });

  it("routes installation feedback to every device and tracks the target status", () => {
    const { bridge, peer, last, advance } = setup();
    const a = peer("a");
    bridge.tick();
    bridge.feedback("td", message("/sys/fps", 59.9));
    bridge.tick();
    expect(last(a, "value")).toEqual({
      t: "value",
      pult: "lobby",
      id: "status",
      value: "59.9",
      by: null,
    });
    expect(last(a, "status")).toMatchObject({ targets: [{ id: "td", online: true }] });
    advance(FEEDBACK_TIMEOUT_MS + 1);
    bridge.tick();
    expect(last(a, "status")).toMatchObject({ targets: [{ id: "td", online: false }] });
  });

  it("logs every command with the device that sent it", () => {
    const { peer, log } = setup();
    peer("a").say({ t: "set", pult: "hall", id: "brightness", value: 0.5 });
    expect(log.find((e) => e.event === "set")).toMatchObject({
      device: "a",
      pult: "hall",
      id: "brightness",
      value: 0.5,
    });
  });
});

describe("pairing mode", () => {
  function pairingSetup() {
    const r = parseConfig(demo);
    if (!r.ok) throw new Error("demo invalid");
    let now = 0;
    const osc: OscMessage[] = [];
    const bridge = new Bridge(
      r.config,
      {
        sendOsc: (_t, m) => osc.push(...m),
        log: () => {},
        now: () => now,
        pairingLinks: () => ({
          app: "otakoyi-control://connect?x",
          web: "http://h/?pin=1",
          pin: "1",
        }),
      },
      { studioKey: "k" },
    );
    return { bridge, osc, advance: (ms: number) => (now += ms) };
  }
  const pairMsgs = (osc: OscMessage[]) => osc.filter((m) => m.address === "/otakoyi/pair");

  it("shows the QR on the installation when it asks (Ctrl+Shift+P) and hides it after the timeout", () => {
    const { bridge, osc, advance } = pairingSetup();
    bridge.feedback("td", message("/otakoyi/pair/request"));
    const shown = pairMsgs(osc).at(-1)!;
    expect(shown.args.map(argValue)).toEqual([
      1,
      120,
      "otakoyi-control://connect?x",
      "http://h/?pin=1",
      "1",
    ]);
    advance(2 * 60 * 1000);
    bridge.tick();
    expect(argValue(pairMsgs(osc).at(-1)!.args[0]!)).toBe(0);
    expect(bridge.pairingUntil).toBeNull();
  });

  it("lets only the studio toggle it from a pult", () => {
    const { bridge, osc } = pairingSetup();
    const inbox: ServerMessage[] = [];
    const peer = { send: (m: ServerMessage) => inbox.push(m), close() {} };
    bridge.connect(peer);
    bridge.handle(peer, JSON.stringify({ t: "hello", v: 1, device: "c", role: "client" }));
    bridge.handle(peer, JSON.stringify({ t: "pairing", show: true }));
    expect(inbox.at(-1)).toMatchObject({ t: "error" });
    expect(pairMsgs(osc)).toHaveLength(0);
    const studio = { send: (m: ServerMessage) => inbox.push(m), close() {} };
    bridge.connect(studio);
    bridge.handle(
      studio,
      JSON.stringify({ t: "hello", v: 1, device: "s", role: "studio", secret: "k" }),
    );
    bridge.handle(studio, JSON.stringify({ t: "pairing", show: true }));
    expect(argValue(pairMsgs(osc).at(-1)!.args[0]!)).toBe(1);
    expect(inbox.at(-1)).toMatchObject({ t: "pairing" });
  });
});

/**
 * Regression (fix/feedback-echo-loop): an installation that echoes every message straight back
 * (docs/integration.md encourages echoing state) while a device drags a continuous control at
 * full rate. The echo is mapped back through the control's range and arrives as float32, so it
 * never equals the value the device sent, and it arrives late — after newer values were sent.
 * The bridge used to apply every echo as new installation state and broadcast it to every device,
 * the sender included: the dragged control was rewound to its older positions ~30 times a second
 * and the app crashed with "Maximum update depth exceeded".
 */
describe("installation echoing feedback while a device drags", () => {
  /** Installation: echoes each OSC message back, through the OSC codec (float32), `lagMs` later. */
  function echoing(lagMs: number) {
    const s = setup();
    const queue: Array<{ at: number; msg: OscMessage }> = [];
    let now = 0;
    const flushEchoes = () => {
      while (s.osc.length)
        queue.push({ at: now + lagMs, msg: decodeMessage(encodeMessage(s.osc.shift()!)) });
      for (let e = queue[0]; e && e.at <= now; e = queue[0]) {
        queue.shift();
        s.bridge.feedback("td", e.msg);
      }
    };
    /** Advance time by `ms`, delivering the echoes that are due. */
    const step = (ms: number) => {
      now += ms;
      s.advance(ms);
      flushEchoes();
    };
    return { ...s, step, flushEchoes };
  }
  const values = (p: { inbox: ServerMessage[] }, id: string) =>
    p.inbox.filter((m) => m.t === "value" && m.id === id) as Extract<
      ServerMessage,
      { t: "value" }
    >[];

  const drags: Array<{ id: string; at: (i: number) => unknown }> = [
    {
      id: "position",
      at: (i) => ({ x: 0.5 + 0.4 * Math.cos(i / 7), y: 0.5 + 0.4 * Math.sin(i / 7) }),
    },
    { id: "intensity", at: (i) => 0.5 + 0.45 * Math.sin(i / 9) },
    { id: "hue", at: (i) => 170 * Math.sin(i / 11) },
    {
      id: "tint",
      at: (i) => `#${((i * 0x10307) & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`,
    },
  ];

  for (const { id, at } of drags)
    it(`${id}: echoes of the device's own values never come back to it, nor rewind the state`, () => {
      const { bridge, peer, step } = echoing(120);
      const a = peer("a");
      const b = peer("b");
      const sent: unknown[] = [];
      // 3 s of dragging at 30 Hz, the echo lagging ~4 messages behind.
      for (let i = 0; i < 90; i++) {
        const value = at(i);
        sent.push(value);
        a.say({ t: "set", pult: "lobby", id, value });
        step(33);
      }
      step(1000);
      const last = bridge.stores.get("lobby")!.get(id);
      // The bridge keeps exactly what the device sent last (not a float32 / older echo of it).
      expect(last).toEqual(sent.at(-1));
      expect(values(a, id)).toEqual([]);
      // The other device sees every move once, from "a" — no echoes in between.
      expect(values(b, id).every((m) => m.by === "a")).toBe(true);
      expect(values(b, id).at(-1)?.value).toEqual(last);
    });

  it("installation state that is not an echo applies at once, also mid-drag", () => {
    const { bridge, peer, step } = echoing(120);
    const a = peer("a");
    for (let i = 0; i < 10; i++) {
      a.say({ t: "set", pult: "lobby", id: "intensity", value: 0.3 + i / 100 });
      step(33);
    }
    // The installation moves the parameter itself (automation, its own UI): every device hears it.
    bridge.feedback("td", message("/wall/intensity", 0.8));
    expect(values(a, "intensity").at(-1)).toMatchObject({ value: 0.8, by: null });
    expect(bridge.stores.get("lobby")!.get("intensity")).toBe(0.8);
  });

  it("an echo of the newest command after an installation change is the installation's state", () => {
    const { bridge, peer, step } = echoing(120);
    const a = peer("a");
    a.say({ t: "set", pult: "lobby", id: "intensity", value: 0.3 });
    step(33);
    bridge.feedback("td", message("/wall/intensity", 0.8));
    // The installation applied our 0.3 after its own 0.8: that is where it is now.
    step(200);
    expect(bridge.stores.get("lobby")!.get("intensity")).toBeCloseTo(0.3, 6);
    expect(values(a, "intensity").at(-1)?.value).toBeCloseTo(0.3, 6);
  });

  it("long after the last command, a matching value is installation state again", () => {
    const { bridge, peer, step } = echoing(120);
    const a = peer("a");
    a.say({ t: "set", pult: "lobby", id: "intensity", value: 0.3 });
    step(200);
    expect(values(a, "intensity")).toEqual([]);
    a.say({ t: "set", pult: "lobby", id: "intensity", value: 0.5 });
    step(ECHO_WINDOW_MS + 1000);
    bridge.feedback("td", message("/wall/intensity", 0.3));
    expect(values(a, "intensity").at(-1)).toMatchObject({ value: 0.3, by: null });
  });
});
