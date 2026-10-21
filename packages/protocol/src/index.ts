import { z } from "zod";

/**
 * Wire protocol between a pult (app or web) and the bridge, over one WebSocket (`/ws`).
 * JSON messages tagged by `t`. The bridge is the authority: it validates every message,
 * owns the control lease and the shared state, and is the only thing that sends OSC.
 */
export const PROTOCOL_VERSION = 1;

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

export type ErrorCode =
  "version" | "auth" | "bad-message" | "no-lease" | "unknown-control" | "bad-value";

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
    }
  /** `by` is the device that changed it, or null for feedback from the installation. */
  | { t: "value"; pult: string; id: string; value: unknown; by: string | null }
  | { t: "lease"; holder: Holder | null }
  | { t: "status"; targets: TargetStatus[] }
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
