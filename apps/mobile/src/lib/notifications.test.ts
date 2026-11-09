import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@osc/protocol";
import { parseConfig } from "@osc/schema";
import { Simulator } from "@osc/sim";
import demo from "../../../../design-system/packages/schema/examples/demo-installation.json";
import {
  deliveryFor,
  notificationText,
  rowStateFor,
  statusEvents,
  toggleNotifications,
  type Permission,
  type StatusSnapshot,
} from "./notifications";
import { Session } from "./session";

const me = "phone";
const base: StatusSnapshot = {
  connection: "open",
  lease: { device: me, role: "client" },
  activity: [],
  actionError: null,
  welcomedAt: 1000,
};
const act = (e: Partial<ActivityEntry>): ActivityEntry => ({
  ts: "2026-10-23T10:00:00.000Z",
  event: "action",
  ...e,
});

describe("statusEvents", () => {
  it("connection lost and restored (after a welcome, not on the first connect)", () => {
    expect(statusEvents(base, { ...base, connection: "connecting" }, me)).toEqual([
      { kind: "connection-lost" },
    ]);
    const down = { ...base, connection: "connecting" as const };
    expect(statusEvents(down, { ...down, connection: "open" }, me)).toEqual([]); // no welcome yet
    expect(statusEvents(down, { ...base, welcomedAt: 2000 }, me)).toEqual([
      { kind: "connection-restored" },
    ]);
    const first = { ...base, connection: "connecting" as const, welcomedAt: null };
    expect(statusEvents(first, base, me)).toEqual([]);
  });

  it("control taken by another device or the studio", () => {
    expect(
      statusEvents(base, { ...base, lease: { device: "ipad", role: "client", name: "iPad" } }, me),
    ).toEqual([{ kind: "lease-taken", by: "device", name: "iPad" }]);
    expect(statusEvents(base, { ...base, lease: { device: "s", role: "studio" } }, me)).toEqual([
      { kind: "lease-taken", by: "studio", name: undefined },
    ]);
    // Released, or never ours: not news.
    expect(statusEvents(base, { ...base, lease: null }, me)).toEqual([]);
    const viewing = { ...base, lease: { device: "ipad", role: "client" as const } };
    expect(
      statusEvents(viewing, { ...viewing, lease: { device: "s", role: "studio" } }, me),
    ).toEqual([]);
  });

  it("installation restarted by someone else; this device's failed action", () => {
    const restart = act({ name: "restart", device: "ipad" });
    expect(statusEvents(base, { ...base, activity: [restart] }, me)).toEqual([
      { kind: "installation-restarted" },
    ]);
    // Already seen, or done by this device: nothing.
    expect(
      statusEvents({ ...base, activity: [restart] }, { ...base, activity: [restart] }, me),
    ).toEqual([]);
    expect(
      statusEvents(base, { ...base, activity: [act({ name: "restart", device: me })] }, me),
    ).toEqual([]);
    const failed = act({ name: "restart", device: me, error: "supervisor: not running" });
    expect(statusEvents(base, { ...base, activity: [failed] }, me)).toEqual([
      { kind: "action-error", message: "supervisor: not running" },
    ]);
    // The welcome's own activity on first connect is history.
    expect(
      statusEvents({ ...base, welcomedAt: null }, { ...base, activity: [restart] }, me),
    ).toEqual([]);
  });

  it("a refused quick action, once", () => {
    const err = { ...base, actionError: { name: "pause", message: "No pause", at: 5 } };
    expect(statusEvents(base, err, me)).toEqual([{ kind: "action-error", message: "No pause" }]);
    expect(statusEvents(err, { ...err }, me)).toEqual([]);
  });
});

describe("deliveryFor", () => {
  const o = { enabled: true, supported: true, permission: "granted" as Permission };
  it("notifies only in the background, switched on, supported and allowed", () => {
    expect(deliveryFor({ ...o, phase: "background" })).toBe("notify");
    expect(deliveryFor({ ...o, phase: "inactive" })).toBe("notify");
    expect(deliveryFor({ ...o, phase: "active" })).toBe("in-app");
    expect(deliveryFor({ ...o, enabled: false, phase: "background" })).toBe("none");
    expect(deliveryFor({ ...o, supported: false, phase: "background" })).toBe("none");
    expect(deliveryFor({ ...o, permission: "denied", phase: "background" })).toBe("none");
    expect(deliveryFor({ ...o, permission: "undetermined", phase: "background" })).toBe("none");
  });
});

describe("notificationText", () => {
  it("names the installation and says what happened", () => {
    expect(notificationText({ kind: "connection-lost" }, "Lobby")).toEqual({
      title: "Lobby",
      body: "Connection lost. Reconnecting…",
    });
    expect(notificationText({ kind: "lease-taken", by: "studio" }, "Lobby").body).toContain(
      "studio",
    );
    expect(notificationText({ kind: "lease-taken", by: "device", name: "iPad" }, "L").body).toBe(
      "iPad took control. This device is view only.",
    );
    expect(notificationText({ kind: "action-error", message: "No pause" }, "L").body).toBe(
      "Quick action failed: No pause",
    );
  });
});

describe("the Settings switch", () => {
  const fake = (first: Permission, answer: Permission = "granted") => {
    const request = vi.fn(async () => answer);
    return { supported: true, permission: vi.fn(async () => first), request };
  };

  it("asks for permission the first time it is turned on", async () => {
    const n = fake("undetermined", "granted");
    expect(await toggleNotifications(true, n)).toEqual({ enabled: true, row: "on" });
    expect(n.request).toHaveBeenCalledTimes(1);
  });

  it("flips back off with an explanation when denied", async () => {
    expect(await toggleNotifications(true, fake("undetermined", "denied"))).toEqual({
      enabled: false,
      row: "denied",
    });
    const already = fake("denied");
    expect(await toggleNotifications(true, already)).toEqual({ enabled: false, row: "denied" });
    expect(already.request).not.toHaveBeenCalled();
  });

  it("does not ask again once granted; turning off never asks", async () => {
    const n = fake("granted");
    expect(await toggleNotifications(true, n)).toEqual({ enabled: true, row: "on" });
    expect(await toggleNotifications(false, n)).toEqual({ enabled: false, row: "off" });
    expect(n.request).not.toHaveBeenCalled();
  });

  it("web: unavailable", async () => {
    expect(await toggleNotifications(true, { ...fake("granted"), supported: false })).toEqual({
      enabled: false,
      row: "unavailable",
    });
    expect(rowStateFor(true, false, "granted")).toBe("unavailable");
  });

  it("a switch left on whose permission was revoked reads as denied", () => {
    expect(rowStateFor(true, true, "denied")).toBe("denied");
    expect(rowStateFor(true, true, "granted")).toBe("on");
    expect(rowStateFor(false, true, "denied")).toBe("off");
  });
});

describe("Session: quick action errors", () => {
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

  it("records the bridge's refusal of the action just sent", async () => {
    const s = new Session({
      kind: "demo",
      device: me,
      transport: sim.transport,
      http: sim.http(me),
    });
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.state.actionError).toBeNull();
    s.setMode("pause", true); // the demo installation has no pause
    await vi.advanceTimersByTimeAsync(0);
    expect(s.state.actionError).toMatchObject({ name: "pause", message: expect.any(String) });
    s.stop();
  });
});
