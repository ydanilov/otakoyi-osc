import { z } from "zod";

/**
 * Wire protocol between a pult (app or web) and the bridge, over one WebSocket (`/ws`).
 * JSON messages tagged by `t`. The bridge is the authority: it validates every message,
 * owns the control lease and the shared state, and is the only thing that sends OSC.
 */
export const PROTOCOL_VERSION = 2;
/**
 * Oldest protocol the bridge still accepts. v2 only adds messages and fields (actions, modes,
 * activity), so v1 pults keep working: they never send the new messages and ignore what they
 * don't know.
 */
export const MIN_PROTOCOL_VERSION = 1;

/** Installation actions a pult can trigger (ADR-013 addendum, ADR-016). */
export const ActionName = z.enum(["flash", "restart", "blackout"]);
export type ActionName = z.infer<typeof ActionName>;
/** Installation modes that stay on until switched off. */
export const ModeName = z.enum(["idle", "pause"]);
export type ModeName = z.infer<typeof ModeName>;

/** Latched installation state, sent in `welcome` and `status`. */
export interface InstallationModes {
  blackout: boolean;
  idle: boolean;
  pause: boolean;
}

/** One line of the activity feed (drawer → Installation). */
export interface ActivityEntry {
  ts: string;
  event:
    | "connect"
    | "disconnect"
    | "set"
    | "lease"
    | "action"
    | "mode"
    | "pairing"
    | "rejected"
    | "prompt"
    | "image";
  device?: string | undefined;
  role?: string | undefined;
  [k: string]: unknown;
}

export const Role = z.enum(["client", "studio"]);
export type Role = z.infer<typeof Role>;

export const ClientMessage = z.discriminatedUnion("t", [
  /** First message. `secret` is the installation PIN (client) or the studio key (studio). */
  z.object({
    t: z.literal("hello"),
    v: z.number().int(),
    device: z.string().min(1).max(64),
    name: z.string().max(64).optional(),
    role: Role,
    secret: z.string().max(256).optional(),
  }),
  /** A control changed on this device. Ignored unless the device holds the lease. */
  z.object({
    t: z.literal("set"),
    pult: z.string().max(64),
    id: z.string().max(64),
    value: z.unknown(),
  }),
  /** Ask for control. The studio always gets it; a client gets it unless the studio holds it. */
  z.object({ t: z.literal("take") }),
  z.object({ t: z.literal("release") }),
  /** Studio only: show / hide the pairing QR on the installation's own output (ADR 012). */
  z.object({ t: z.literal("pairing"), show: z.boolean() }),
  z.object({ t: z.literal("ping"), at: z.number() }),
  /**
   * v2. Trigger an installation action (lease holder or studio). `on` is required for blackout
   * (latched); flash and restart are one-shot. The pult asks for hold-to-confirm before sending
   * restart and blackout.
   */
  z.object({ t: z.literal("action"), name: ActionName, on: z.boolean().optional() }),
  /** v2. Switch an installation mode on or off (lease holder or studio). */
  z.object({ t: z.literal("mode"), mode: ModeName, on: z.boolean() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface Holder {
  device: string;
  name?: string | undefined;
  role: Role;
}

export interface TargetStatus {
  id: string;
  /** Feedback arrived from the installation recently. */
  online: boolean;
  lastFeedbackAt: number | null;
}

/**
 * `GET /api/health` (and the simulator's `health()`): what the Installation panel shows as stats.
 * Fields after `devices` were added with the panel; older bridges leave them out.
 */
export interface BridgeHealth {
  ok: boolean;
  protocol: number;
  installation: { id: string; name: string; revision: number; [k: string]: unknown };
  targets: Array<TargetStatus & { lastSeen?: string | null; [k: string]: unknown }>;
  modes: InstallationModes;
  devices: number;
  /** When the bridge started, epoch ms. */
  startedAt?: number;
  uptimeS?: number;
  /** Last `/sys/fps` from the installation, or null when it never reported one. */
  fps?: number | null;
}

export type ErrorCode =
  | "version"
  | "auth"
  | "bad-message"
  | "no-lease"
  | "unknown-control"
  | "bad-value"
  /** v2: the installation does not support this action / mode. */
  | "unsupported";

export type ServerMessage =
  | {
      t: "welcome";
      v: number;
      /** The installation config (already validated by the bridge). */
      config: unknown;
      /** pultId → controlId → value. */
      state: Record<string, Record<string, unknown>>;
      lease: Holder | null;
      targets: TargetStatus[];
      /** v2: actions and modes this installation supports. */
      actions?: string[];
      /** v2: latched installation state. */
      modes?: InstallationModes;
      /** v2: the most recent activity, oldest first. */
      activity?: ActivityEntry[];
    }
  /** `by` is the device that changed it, or null for feedback from the installation. */
  | { t: "value"; pult: string; id: string; value: unknown; by: string | null }
  | { t: "lease"; holder: Holder | null }
  | { t: "status"; targets: TargetStatus[]; modes?: InstallationModes }
  /** v2: new activity since the last batch (sent at most once a second), oldest first. */
  | { t: "activity"; entries: ActivityEntry[] }
  /**
   * v2: confirmation of the last prompt sent by a prompt control: `applying` right after the
   * bridge sent it, then `applied` when the installation confirms or `error` after `confirmMs`.
   */
  | { t: "prompt"; pult: string; id: string; state: "applying" | "applied" | "error"; seq: number }
  /** v2: a control's data on the bridge changed (prompt presets, image library): fetch it again. */
  | { t: "data"; pult: string; id: string; kind: "prompts" | "images" }
  | { t: "error"; code: ErrorCode; message: string }
  | { t: "pong"; at: number }
  /** Pairing QR shown on the installation until `until` (epoch ms), or hidden (null). */
  | { t: "pairing"; until: number | null };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const r = ClientMessage.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** What a device should do given the current lease. */
export function modeFor(
  holder: Holder | null,
  device: string,
): "control" | "view" | "studio-has-control" {
  if (holder?.device === device) return "control";
  if (holder?.role === "studio") return "studio-has-control";
  return "view";
}

export * from "./client";
export * from "./pairing";
export * from "./http";
