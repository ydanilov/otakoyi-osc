import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promptValue } from "@osc/controls";
import type { BridgeConnection, ServerMessage } from "@osc/protocol";
import { parseConfig } from "@osc/schema";
import demo from "../../schema/examples/demo-installation.json";
import { AUDIO_ADDRESS, ECHO_MS, Simulator } from "./simulator";

const parsed = parseConfig(demo);
if (!parsed.ok) throw new Error("demo config");
const config = parsed.config;

let sim: Simulator;
beforeEach(() => {
  vi.useFakeTimers();
  let n = 0;
  sim = new Simulator({ config, random: () => (n++ % 7) / 7 });
  sim.start();
});
afterEach(() => {
  sim.stop();
  vi.useRealTimers();
});

/** Connect a pult to the simulator through its transport, like the app does. */
async function connect(device = "phone") {
  const inbox: ServerMessage[] = [];
  const states: BridgeConnection[] = [];
  const t = sim.transport({
    device,
    role: "client",
    onMessage: (m) => inbox.push(m),
    onConnection: (s) => states.push(s),
  });
  t.connect();
  await vi.advanceTimersByTimeAsync(0);
  return { t, inbox, states };
}

describe("simulated installation (demo mode)", () => {
  it("speaks the bridge protocol: hello → welcome with the demo config, lease to the device", async () => {
    const { t, inbox, states } = await connect();
    expect(states).toEqual(["connecting", "open"]);
    expect(t.state).toBe("open");
    const welcome = inbox.find((m) => m.t === "welcome");
    expect(welcome).toMatchObject({ t: "welcome", v: 2, actions: expect.any(Array) });
    expect(inbox.find((m) => m.t === "lease")).toMatchObject({ holder: { device: "phone" } });
    t.close();
    expect(t.state).toBe("closed");
  });

  it("echoes values back as feedback and moves the preview", async () => {
    const { t } = await connect();
    const feedback = vi.spyOn(sim.bridge, "feedback");
    const before = sim.preview().brightness;
    t.send({ t: "set", pult: "lobby", id: "intensity", value: 1 });
    expect(sim.preview().brightness).toBe(1);
    expect(before).not.toBe(1);
    expect(feedback).not.toHaveBeenCalledWith("td", expect.anything());
    await vi.advanceTimersByTimeAsync(ECHO_MS + 1);
    // The installation echoes the value back on the same address, as feedback.
    expect(feedback).toHaveBeenCalledWith(
      "td",
      expect.objectContaining({ address: "/wall/intensity" }),
    );
    t.send({ t: "set", pult: "lobby", id: "hue", value: 90 });
    expect(sim.preview().hue).toBeCloseTo(90, 5);
    t.send({ t: "set", pult: "lobby", id: "speed", value: 0 });
    expect(sim.preview().speed).toBe(0);
  });

  it("reports FPS (~60 with jitter) at 1 Hz and an audio level at 10 Hz", async () => {
    const { inbox } = await connect();
    inbox.length = 0;
    await vi.advanceTimersByTimeAsync(1000);
    const fps = inbox.filter((m) => m.t === "value" && m.id === "status");
    expect(fps).toHaveLength(1);
    const audio = inbox.filter((m) => m.t === "value" && m.id === "audio");
    expect(audio.length).toBeGreaterThanOrEqual(9);
    expect(audio.length).toBeLessThanOrEqual(11);
    const h = await sim.http("phone").health();
    expect(h.fps).toBeGreaterThan(58);
    expect(h.fps).toBeLessThan(62);
    expect(h).toMatchObject({ ok: true, devices: 1 });
    expect(h.targets[0]!.online).toBe(true);
    expect(AUDIO_ADDRESS).toBe("/wall/audio/level");
  });

  it("answers installation actions and modes, and logs them in the activity feed", async () => {
    const { t, inbox } = await connect();
    const flashes = sim.preview().flash;
    t.send({ t: "action", name: "flash" });
    expect(sim.preview().flash).toBe(flashes + 1);
    t.send({ t: "action", name: "blackout", on: true });
    expect(sim.preview().blackout).toBe(true);
    t.send({ t: "mode", mode: "idle", on: true });
    expect(sim.preview().idle).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(inbox).toContainEqual(
      expect.objectContaining({ t: "status", modes: { blackout: true, idle: true, pause: false } }),
    );
    const activity = inbox.filter((m) => m.t === "activity").flatMap((m) => m.entries);
    expect(activity.map((e) => e.event)).toEqual(expect.arrayContaining(["action", "mode"]));
    expect((await sim.http("phone").activity()).length).toBeGreaterThan(2);
  });

  it("keeps prompt presets in memory: create, soft delete, undo, persisted reorder", async () => {
    await connect();
    const http = sim.http("phone");
    const a = await http.prompts.create("live", "prompt", { label: "Aurora", text: "aurora" });
    const b = await http.prompts.create("live", "prompt", { label: "Neon", text: "neon rain" });
    await http.prompts.remove(a.id);
    expect((await http.prompts.list("live", "prompt")).map((p) => p.id)).toEqual([b.id]);
    await http.prompts.restore(a.id);
    expect((await http.prompts.list("live", "prompt")).map((p) => p.id)).toEqual([a.id, b.id]);
    await http.prompts.reorder("live", "prompt", [b.id, a.id]);
    expect((await http.prompts.list("live", "prompt")).map((p) => p.id)).toEqual([b.id, a.id]);
    // Another device without the lease cannot change them.
    await expect(http.prompts.remove(a.id)).resolves.toBeTruthy();
    await expect(sim.http("other").prompts.restore(a.id)).rejects.toThrow(/in control/);
  });

  it("confirms a prompt by echoing it (Applying → applied) and shows it on the preview", async () => {
    const { t, inbox } = await connect();
    const http = sim.http("phone");
    const p = await http.prompts.create("live", "prompt", { label: "Aurora", text: "aurora" });
    const value = promptValue([p], { a: p.id, b: null, mix: 0 }, 500);
    t.send({ t: "set", pult: "live", id: "prompt", value });
    await vi.advanceTimersByTimeAsync(ECHO_MS + 1);
    const states = inbox.filter((m) => m.t === "prompt").map((m) => m.state);
    expect(states).toEqual(["applying", "applied"]);
    expect(sim.preview().prompt).toBe("aurora");
  });

  it("refuses a pult that is not in control, like the real bridge", async () => {
    await connect("phone");
    const second = await connect("tablet");
    second.t.send({ t: "set", pult: "lobby", id: "intensity", value: 0.1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(second.inbox).toContainEqual(expect.objectContaining({ t: "error", code: "no-lease" }));
  });
});
