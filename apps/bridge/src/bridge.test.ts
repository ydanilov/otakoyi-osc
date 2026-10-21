import { describe, expect, it } from "vitest";
import { argValue, message, type OscMessage } from "@osc/core";
import type { ServerMessage } from "@osc/protocol";
import { parseConfig } from "@osc/schema";
import demo from "../../../packages/schema/examples/demo-installation.json";
import { Bridge, FEEDBACK_TIMEOUT_MS, type LogEntry, type Peer } from "./bridge";

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
