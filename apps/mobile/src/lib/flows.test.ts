import { describe, expect, it } from "vitest";
import { message } from "@osc/core";
import { resolveAsset } from "./assets";
import {
  actionMessage,
  activityLine,
  formatFps,
  formatUptime,
  installationState,
  installationStats,
  modeToggles,
  quickActions,
} from "./installation";
import { MIN_LOADING_MS, UNREACHABLE_MS, loadingPhase, nextLoadingTick } from "./loading";
import { EDGE_SWIPE_MIN, edgeSwipe, edgeTarget, formFactorOf, presentationOf } from "./nav";
import { createPairingStore, memoryKeyValue, PAIRING_KEY } from "./pairing";
import { DEFAULT_PREFS, loadPrefs, savePrefs } from "./prefs";

const open = { connection: "open" as const, config: {} as never, error: null, welcomedAt: 1 };
const connecting = {
  connection: "connecting" as const,
  config: null,
  error: null,
  welcomedAt: null,
};

describe("loading screen", () => {
  it("shows at least MIN_LOADING_MS even when the bridge answers at once", () => {
    expect(loadingPhase({ state: open, startedAt: 0, now: 100, name: "Lobby" }).phase).toBe(
      "loading",
    );
    expect(
      loadingPhase({ state: open, startedAt: 0, now: MIN_LOADING_MS, name: "Lobby" }).phase,
    ).toBe("ready");
  });
  it("has no maximum while connecting, but says so inline after a while", () => {
    expect(loadingPhase({ state: connecting, startedAt: 0, now: 5000, name: "Lobby" }).phase).toBe(
      "loading",
    );
    const late = loadingPhase({
      state: connecting,
      startedAt: 0,
      now: UNREACHABLE_MS,
      name: "Lobby",
    });
    expect(late).toMatchObject({
      phase: "error",
      title: "Can't reach Lobby",
      actions: ["retry", "address"],
    });
    // Connected later: straight to the pult.
    expect(
      loadingPhase({ state: open, startedAt: 0, now: UNREACHABLE_MS + 1, name: "Lobby" }).phase,
    ).toBe("ready");
  });
  it("errors are inline with Retry / Enter address; the demo has no address", () => {
    const auth = { ...connecting, error: { code: "auth" as const, message: "Wrong PIN" } };
    expect(loadingPhase({ state: auth, startedAt: 0, now: 0, name: "Lobby" })).toMatchObject({
      phase: "error",
      title: "Wrong PIN",
      actions: ["address", "retry"],
    });
    const bad = { ...connecting, error: { code: "bad-message" as const, message: "x" } };
    expect(
      loadingPhase({ state: bad, startedAt: 0, now: 0, name: "Demo", demo: true }),
    ).toMatchObject({
      actions: ["retry"],
    });
  });
  it("schedules the next time-based change", () => {
    expect(nextLoadingTick(0, 100)).toBe(MIN_LOADING_MS - 100);
    expect(nextLoadingTick(0, MIN_LOADING_MS)).toBe(UNREACHABLE_MS - MIN_LOADING_MS);
    expect(nextLoadingTick(0, UNREACHABLE_MS)).toBeNull();
  });
});

describe("navigation (ADR-013)", () => {
  it("iPad from 768 pt", () => {
    expect(formFactorOf(390)).toBe("phone");
    expect(formFactorOf(767)).toBe("phone");
    expect(formFactorOf(768)).toBe("tablet");
  });
  it("right edge → Installation everywhere; left edge → Settings on phone only", () => {
    expect(edgeTarget("right", "phone")).toBe("installation");
    expect(edgeTarget("right", "tablet")).toBe("installation");
    expect(edgeTarget("left", "phone")).toBe("settings");
    expect(edgeTarget("left", "tablet")).toBeNull();
  });
  it("a swipe must go inwards far enough", () => {
    expect(edgeSwipe("left", EDGE_SWIPE_MIN, "phone")).toBe("settings");
    expect(edgeSwipe("left", -80, "phone")).toBeNull();
    expect(edgeSwipe("right", -EDGE_SWIPE_MIN, "tablet")).toBe("installation");
    expect(edgeSwipe("right", -10, "phone")).toBeNull();
  });
  it("iPhone: sheets; iPad: Settings form sheet, Installation inspector", () => {
    expect(presentationOf("settings", "phone")).toBe("sheet");
    expect(presentationOf("installation", "phone")).toBe("sheet");
    expect(presentationOf("settings", "tablet")).toBe("formSheet");
    expect(presentationOf("installation", "tablet")).toBe("inspector");
  });
});

describe("installation panel", () => {
  const modes = { blackout: false, idle: false, pause: false };
  it("formats stats", () => {
    expect(formatUptime(40)).toBe("40 s");
    expect(formatUptime(12 * 60 + 5)).toBe("12 min");
    expect(formatUptime(2 * 3600 + 5 * 60)).toBe("2 h 05 min");
    expect(formatUptime(3 * 86400 + 4 * 3600)).toBe("3 d 4 h");
    expect(formatUptime(undefined)).toBe("—");
    expect(formatFps(59.94)).toBe("59.9");
    expect(formatFps(null)).toBe("—");
    expect(
      installationStats({ devices: 2, uptimeS: 65, fps: 60 }, { online: true, modes }).map(
        (s) => s.value,
      ),
    ).toEqual(["Online", "60.0", "2", "1 min"]);
  });
  it("latched modes win over online; offline wins over everything", () => {
    expect(installationState({ online: true, modes: { ...modes, idle: true } }).label).toBe("Idle");
    expect(
      installationState({ online: true, modes: { ...modes, blackout: true, idle: true } }).label,
    ).toBe("Blackout");
    expect(installationState({ online: false, modes: { ...modes, blackout: true } }).label).toBe(
      "Offline",
    );
  });
  it("quick actions: only supported ones; Restart and Blackout hold to confirm; Blackout toggles", () => {
    const a = quickActions(["flash", "restart", "blackout", "idle"]);
    expect(a.map((x) => [x.name, x.hold])).toEqual([
      ["flash", false],
      ["restart", true],
      ["blackout", true],
    ]);
    expect(quickActions(["flash"])).toHaveLength(1);
    expect(actionMessage(a[2]!, modes)).toEqual({ name: "blackout", on: true });
    expect(actionMessage(a[2]!, { ...modes, blackout: true })).toEqual({
      name: "blackout",
      on: false,
    });
    expect(actionMessage(a[0]!, modes)).toEqual({ name: "flash" });
    expect(modeToggles(["idle"]).map((m) => m.name)).toEqual(["idle"]);
    expect(modeToggles(["idle", "pause"]).map((m) => m.label)).toEqual(["Idle", "Pause"]);
  });
  it("activity lines say what happened and who", () => {
    const ts = "2026-10-22T10:11:12.000Z";
    expect(
      activityLine({ ts, event: "action", name: "blackout", on: true, device: "me" }, null, "me"),
    ).toMatchObject({
      title: "Blackout",
      detail: "On · This device",
    });
    expect(
      activityLine(
        { ts, event: "mode", name: "idle", on: false, device: "x", role: "studio" },
        null,
      ).title,
    ).toBe("Idle off");
    expect(activityLine({ ts, event: "connect", device: "abcdefghijkl" }, null).detail).toBe(
      "Device abcdefgh",
    );
    expect(activityLine({ ts, event: "set", pult: "p", id: "c", device: "x" }, null).title).toBe(
      "Changed c",
    );
  });
});

describe("pairing storage and preferences", () => {
  it("saves, loads and forgets the pairing (with the brand for the next launch)", async () => {
    const kv = memoryKeyValue();
    const store = createPairingStore(kv);
    expect(await store.load()).toBeNull();
    await store.save({ bridge: "ws://10.0.0.2:8080/ws", pin: "2468", name: "Lobby" });
    expect(await store.load()).toMatchObject({ bridge: "ws://10.0.0.2:8080/ws", pin: "2468" });
    await store.clear();
    expect(await store.load()).toBeNull();
    await kv.set(PAIRING_KEY, "{not json");
    expect(await store.load()).toBeNull();
  });
  it("preferences default to on and survive a reload", async () => {
    const kv = memoryKeyValue();
    expect(await loadPrefs(kv)).toEqual(DEFAULT_PREFS);
    await savePrefs(kv, { haptics: false, keepAwake: true });
    expect(await loadPrefs(kv)).toEqual({ haptics: false, keepAwake: true });
    // A stored key from an older build (the removed debug overlay switch) is dropped.
    await kv.set(
      "otakoyi.prefs",
      JSON.stringify({ haptics: true, keepAwake: false, debugOverlay: true }),
    );
    expect(await loadPrefs(kv)).toEqual({ haptics: true, keepAwake: false });
  });
});

describe("brand assets", () => {
  it("URLs as is; relative paths from the bridge's /brand/ or the bundled demo", () => {
    expect(resolveAsset("https://cdn.example.com/a.jpg", {})).toEqual({
      uri: "https://cdn.example.com/a.jpg",
    });
    expect(resolveAsset("splash.jpg", { httpBase: "http://10.0.0.2:8080" })).toEqual({
      uri: "http://10.0.0.2:8080/brand/splash.jpg",
    });
    expect(resolveAsset("demo-splash.jpg", { bundled: { "demo-splash.jpg": 7 } })).toBe(7);
    expect(resolveAsset("../secret.png", { httpBase: "http://h" })).toBeNull();
    expect(resolveAsset("javascript:alert(1)", { httpBase: "http://h" })).toBeNull();
    expect(resolveAsset(undefined, {})).toBeNull();
    expect(message("/x").address).toBe("/x");
  });
});
