import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "@osc/schema";
import { Simulator } from "@osc/sim";
import demo from "../../../../packages/schema/examples/demo-installation.json";
import { Session, installationOnline } from "./session";

const parsed = parseConfig(demo);
if (!parsed.ok) throw new Error("demo config");

let sim: Simulator;
beforeEach(() => {
  vi.useFakeTimers();
  sim = new Simulator({ config: parsed.config });
  sim.start();
});
afterEach(() => {
  sim.stop();
  vi.useRealTimers();
});

const demoSession = (device = "phone") =>
  new Session({
    kind: "demo",
    device,
    transport: sim.transport,
    http: sim.http(device),
  });

describe("Session over a transport (here: the in-app simulator)", () => {
  it("connects, receives the config and the lease, builds a store per pult", async () => {
    const s = demoSession();
    const seen: string[] = [];
    s.subscribe(() => seen.push(s.state.connection));
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.state.connection).toBe("open");
    expect(s.state.config?.installation.id).toBe("demo");
    expect([...s.stores.keys()]).toEqual(["lobby", "hall", "live"]);
    expect(s.controlMode()).toBe("control");
    expect(installationOnline(s.state)).toBe(true);
    expect(s.state.actions).toEqual(expect.arrayContaining(["flash", "restart", "blackout"]));
    expect(seen).toContain("open");
  });

  it("sends interactions to the bridge, which applies them for every pult", async () => {
    const a = demoSession("phone");
    const b = demoSession("tablet");
    a.start();
    b.start();
    await vi.advanceTimersByTimeAsync(0);
    const lobby = a.stores.get("lobby")!;
    lobby.interact(lobby.control("intensity")!, 0.25);
    await vi.advanceTimersByTimeAsync(0);
    expect(b.stores.get("lobby")!.get("intensity")).toBe(0.25);
    expect(b.controlMode()).toBe("view");
    b.take();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.controlMode()).toBe("control");
    expect(a.controlMode()).toBe("view");
  });

  it("actions and modes go through the protocol; status and activity come back", async () => {
    const s = demoSession();
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    s.action("blackout", true);
    s.setMode("idle", true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.state.modes).toEqual({ blackout: true, idle: true, pause: false });
    expect(s.state.activity.map((e) => e.event)).toEqual(
      expect.arrayContaining(["action", "mode"]),
    );
    expect(sim.preview().blackout).toBe(true);
    // The welcome's entries are not repeated when the bridge's next batch arrives.
    expect(s.state.activity.filter((e) => e.event === "connect")).toHaveLength(1);
  });

  it("marks the connection lost when an open connection drops, and clears it on reconnect", async () => {
    const s = demoSession();
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    s.stop();
    expect(s.state.lost).toBe(true);
    expect(s.controlMode()).toBe("offline");
    s.restart();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.state.lost).toBe(false);
    expect(s.state.connection).toBe("open");
  });

  it("an auth error from the bridge is kept for the loading screen", async () => {
    const s = new Session({
      kind: "bridge",
      device: "phone",
      http: sim.http("phone"),
      transport: (h) => ({
        state: "closed",
        connect: () => {
          h.onConnection?.("connecting");
          queueMicrotask(() => h.onMessage({ t: "error", code: "auth", message: "Wrong PIN" }));
        },
        close: () => {},
        send: () => {},
      }),
    });
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.state.error).toEqual({ code: "auth", message: "Wrong PIN" });
  });

  it("feeds the debug overlay: OSC out per control, RTT of the ping, FPS from telemetry", async () => {
    const s = demoSession();
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    const lobby = s.stores.get("lobby")!;
    const intensity = lobby.control("intensity")!;
    lobby.interact(intensity, 0.25);
    const tag = s.debug.control("intensity");
    expect(tag?.value).toBe("0.250");
    expect(s.debug.entries().at(-1)).toMatchObject({
      dir: "out",
      address: (intensity as { address: string }).address,
    });
    expect(s.debug.rtt).toBeNull();
    s.setDebug(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(s.debug.rtt).not.toBeNull();
    expect(s.debug.fps).toBeGreaterThan(50);
    // Feedback that changes a value (the demo's audio meter) is logged as received.
    await vi.advanceTimersByTimeAsync(500);
    expect(s.debug.entries().some((e) => e.dir === "in")).toBe(true);
    s.stop();
  });
});
