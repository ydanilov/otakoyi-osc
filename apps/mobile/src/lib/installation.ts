import type {
  ActionName,
  ActivityEntry,
  BridgeHealth,
  InstallationModes,
  ModeName,
} from "@osc/protocol";
import type { InstallationConfig } from "@osc/schema";

/** "3 d 4 h", "2 h 05 min", "12 min", "40 s". */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return "—";
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}

export function formatFps(fps: number | null | undefined): string {
  return typeof fps === "number" && Number.isFinite(fps) ? fps.toFixed(1) : "—";
}

export type InstallationStateName = "online" | "offline" | "blackout" | "paused" | "idle";

/** One word for the installation's state; latched modes win over plain "online". */
export function installationState(o: { online: boolean; modes: InstallationModes }): {
  name: InstallationStateName;
  label: string;
} {
  if (!o.online) return { name: "offline", label: "Offline" };
  if (o.modes.blackout) return { name: "blackout", label: "Blackout" };
  if (o.modes.pause) return { name: "paused", label: "Paused" };
  if (o.modes.idle) return { name: "idle", label: "Idle" };
  return { name: "online", label: "Online" };
}

export interface Stat {
  key: "state" | "fps" | "devices" | "uptime";
  label: string;
  value: string;
}

/** Stat tiles of the Installation panel, from `/api/health` (or the simulator's). */
export function installationStats(
  health: Pick<BridgeHealth, "devices" | "uptimeS" | "fps"> | null,
  state: { online: boolean; modes: InstallationModes },
): Stat[] {
  return [
    { key: "state", label: "State", value: installationState(state).label },
    { key: "fps", label: "FPS", value: formatFps(health?.fps) },
    { key: "devices", label: "Devices", value: health ? String(health.devices) : "—" },
    { key: "uptime", label: "Uptime", value: formatUptime(health?.uptimeS) },
  ];
}

export interface QuickAction {
  name: ActionName;
  label: string;
  /** Restart and Blackout ask for hold-to-confirm (ADR-016). */
  hold: boolean;
  /** Blackout is latched: the button shows on / off and sends `on`. */
  latched: boolean;
}

const ACTION_LABEL: Record<ActionName, string> = {
  flash: "Flash",
  restart: "Restart",
  blackout: "Blackout",
};

/** Quick actions this installation supports, in HIG order (safe first, destructive last). */
export function quickActions(supported: readonly string[]): QuickAction[] {
  return (["flash", "restart", "blackout"] as const)
    .filter((n) => supported.includes(n))
    .map((name) => ({
      name,
      label: ACTION_LABEL[name],
      hold: name !== "flash",
      latched: name === "blackout",
    }));
}

/** Modes (Idle, optional Pause) this installation supports. */
export function modeToggles(supported: readonly string[]): { name: ModeName; label: string }[] {
  return (["idle", "pause"] as const)
    .filter((n) => supported.includes(n))
    .map((name) => ({
      name,
      label: name === "idle" ? "Idle mode — ignore players" : "Pause playback",
    }));
}

/** What to send for a quick action that was confirmed. */
export function actionMessage(
  a: QuickAction,
  modes: InstallationModes,
): { name: ActionName; on?: boolean } {
  return a.latched ? { name: a.name, on: !modes.blackout } : { name: a.name };
}

/** One line of the Activity list: what happened and who did it. */
export function activityLine(
  e: ActivityEntry,
  config: InstallationConfig | null,
  me?: string,
): { title: string; detail: string; time: string } {
  const who =
    e.device === undefined
      ? ""
      : e.device === me
        ? "This device"
        : e.role === "studio"
          ? "Studio"
          : e.device.startsWith("target:")
            ? "Installation"
            : `Device ${e.device.slice(0, 8)}`;
  const time = formatTime(e.ts);
  const label = (pult: unknown, id: unknown) => {
    const p = config?.pults.find((x) => x.id === pult);
    const c = p?.pages.flatMap((g) => g.controls).find((x) => x.id === id);
    const l = c && "label" in c ? c.label : undefined;
    return l ?? (typeof id === "string" ? id : "a control");
  };
  const name = typeof e.name === "string" ? e.name : "";
  const on = e.on === true ? "on" : e.on === false ? "off" : "";
  switch (e.event) {
    case "connect":
      return { title: "Connected", detail: who, time };
    case "disconnect":
      return { title: "Disconnected", detail: who, time };
    case "set":
      return { title: `Changed ${label(e.pult, e.id)}`, detail: who, time };
    case "lease":
      return { title: e.holder ? "Took control" : "Control released", detail: who, time };
    case "action":
      return {
        title: cap(name || "Action"),
        detail: [on && cap(on), who].filter(Boolean).join(" · "),
        time,
      };
    case "mode":
      return { title: `${cap(name || "Mode")} ${on}`.trim(), detail: who, time };
    case "prompt":
      return { title: `Prompt ${typeof e.op === "string" ? e.op : "changed"}`, detail: who, time };
    case "image":
      return { title: `Image ${typeof e.op === "string" ? e.op : "changed"}`, detail: who, time };
    case "pairing":
      return { title: e.show ? "Pairing QR shown" : "Pairing QR hidden", detail: who, time };
    case "rejected":
      return {
        title: "Refused",
        detail: [String(e.reason ?? ""), who].filter(Boolean).join(" · "),
        time,
      };
  }
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/** Installation › System row subtitle (ADR-018), e.g. "1920 × 1080 · Debug on". */
export function systemSummary(v: {
  resw?: number | undefined;
  resh?: number | undefined;
  debug?: boolean | undefined;
}): string {
  const size = v.resw !== undefined && v.resh !== undefined ? `${v.resw} × ${v.resh}` : "Output";
  return v.debug ? `${size} · Debug on` : size;
}
