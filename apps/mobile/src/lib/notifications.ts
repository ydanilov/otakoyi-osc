import type { ActivityEntry } from "@osc/protocol";
import type { SessionState } from "./session";

/**
 * Status notifications (Settings › Control preferences › Status notifications). Pure logic: which
 * session changes are worth telling the user about, and how — a local notification while the app
 * is in the background, the existing in-app banners and dialogs while it is in the foreground.
 * The platform part (expo-notifications, or nothing on the web) sits behind `Notifier`.
 */

export type StatusEvent =
  | { kind: "connection-lost" }
  | { kind: "connection-restored" }
  | { kind: "lease-taken"; by: "device" | "studio"; name?: string | undefined }
  | { kind: "installation-restarted" }
  | { kind: "action-error"; message: string };

/** The slice of the session state the events are derived from. */
export type StatusSnapshot = Pick<
  SessionState,
  "connection" | "lease" | "activity" | "actionError" | "welcomedAt"
>;

const activityKey = (e: ActivityEntry) => `${e.ts}|${e.event}|${e.device ?? ""}|${e.name ?? ""}`;

/**
 * Events between two session states, for this device (`me`). Nothing before the first welcome:
 * connecting for the first time, and the activity that came with the welcome, are not news.
 */
export function statusEvents(
  prev: StatusSnapshot,
  next: StatusSnapshot,
  me: string,
): StatusEvent[] {
  const out: StatusEvent[] = [];
  const known = prev.welcomedAt !== null;
  if (known && prev.connection === "open" && next.connection !== "open")
    out.push({ kind: "connection-lost" });
  // Restored = the welcome after a drop (the socket opening is not enough: the bridge may refuse).
  if (
    known &&
    next.welcomedAt !== null &&
    next.welcomedAt !== prev.welcomedAt &&
    next.connection === "open"
  )
    out.push({ kind: "connection-restored" });
  // Another device or the studio took the lease from this device.
  if (prev.lease?.device === me && next.lease && next.lease.device !== me)
    out.push({
      kind: "lease-taken",
      by: next.lease.role === "studio" ? "studio" : "device",
      name: next.lease.name,
    });
  if (known) {
    const seen = new Set(prev.activity.map(activityKey));
    for (const e of next.activity) {
      if (seen.has(activityKey(e)) || e.event !== "action") continue;
      if (typeof e.error === "string" && e.device === me)
        out.push({ kind: "action-error", message: e.error });
      else if (e.name === "restart" && e.error === undefined && e.device !== me)
        out.push({ kind: "installation-restarted" });
    }
  }
  if (next.actionError && next.actionError.at !== prev.actionError?.at)
    out.push({ kind: "action-error", message: next.actionError.message });
  return out;
}

export type Permission = "granted" | "denied" | "undetermined";
export type AppPhase = "active" | "background" | "inactive";

/**
 * How to deliver an event: a local notification only while the app is not in the foreground, the
 * switch is on, the platform has notifications and the user allowed them; in the foreground the
 * screens already show it (header banners, the connection-lost dialog, the Installation panel).
 */
export function deliveryFor(o: {
  enabled: boolean;
  supported: boolean;
  permission: Permission;
  phase: AppPhase;
}): "notify" | "in-app" | "none" {
  if (o.phase === "active") return "in-app";
  return o.enabled && o.supported && o.permission === "granted" ? "notify" : "none";
}

/** Title and body of a notification. */
export function notificationText(
  e: StatusEvent,
  installation: string,
): { title: string; body: string } {
  switch (e.kind) {
    case "connection-lost":
      return { title: installation, body: "Connection lost. Reconnecting…" };
    case "connection-restored":
      return { title: installation, body: "Connected again." };
    case "lease-taken":
      return {
        title: installation,
        body:
          e.by === "studio"
            ? "The studio took control. This device is view only."
            : `${e.name ? e.name : "Another device"} took control. This device is view only.`,
      };
    case "installation-restarted":
      return { title: installation, body: "The installation restarted." };
    case "action-error":
      return { title: installation, body: `Quick action failed: ${e.message}` };
  }
}

/** Local notifications on this platform (expo-notifications on iOS / Android; none on the web). */
export interface Notifier {
  /** False on the web: the switch is shown disabled with a caption. */
  readonly supported: boolean;
  permission(): Promise<Permission>;
  /** Ask the system (shows the iOS / Android prompt once; later calls return the answer). */
  request(): Promise<Permission>;
  show(title: string, body: string): Promise<void>;
}

/** What the Settings row shows. */
export type NotificationsRowState = "off" | "on" | "asking" | "denied" | "unavailable";

/**
 * The user flipped the switch. Turning it on asks for permission (the first time the system shows
 * its prompt); if it is denied the switch goes back off and the row explains why.
 */
export async function toggleNotifications(
  on: boolean,
  notifier: Pick<Notifier, "supported" | "permission" | "request">,
): Promise<{ enabled: boolean; row: NotificationsRowState }> {
  if (!notifier.supported) return { enabled: false, row: "unavailable" };
  if (!on) return { enabled: false, row: "off" };
  let p = await notifier.permission().catch((): Permission => "undetermined");
  if (p === "undetermined") p = await notifier.request().catch((): Permission => "denied");
  return p === "granted" ? { enabled: true, row: "on" } : { enabled: false, row: "denied" };
}

/**
 * The row when Settings opens: a switch left on (an earlier version defaulted to on) whose
 * permission was since revoked in the system settings reads as denied, and is switched off.
 */
export function rowStateFor(
  enabled: boolean,
  supported: boolean,
  permission: Permission,
): NotificationsRowState {
  if (!supported) return "unavailable";
  if (!enabled) return "off";
  return permission === "denied" ? "denied" : "on";
}
