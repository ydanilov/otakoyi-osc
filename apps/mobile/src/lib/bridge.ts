import { createBridgeHttp, httpBaseOf, webSocketTransport, type Pairing } from "@osc/protocol";
import type { KeyValueStore } from "./pairing";
import { Session } from "./session";

const DEVICE_KEY = "otakoyi.device";
let cachedId: string | null = null;

/**
 * Stable per-device id, so a reconnect keeps the control lease. Kept in storage and cached for the
 * process, so the socket and HTTP calls (image uploads, prompt presets) present the same device.
 */
export async function deviceId(kv: KeyValueStore): Promise<string> {
  if (cachedId) return cachedId;
  const existing = await kv.get(DEVICE_KEY).catch(() => null);
  if (existing) return (cachedId = existing);
  const id = `dev-${Math.random().toString(36).slice(2, 10)}`;
  await kv.set(DEVICE_KEY, id).catch(() => {});
  return (cachedId = id);
}

/** A session with a real bridge on the installation's network (WebSocket + HTTP). */
export function createBridgeSession(pairing: Pairing, device: string): Session {
  return new Session({
    kind: "bridge",
    name: pairing.name,
    bridge: pairing.bridge,
    pin: pairing.pin,
    device,
    deviceName: typeof navigator !== "undefined" ? navigator.userAgent?.slice(0, 64) : undefined,
    transport: webSocketTransport(pairing.bridge),
    http: createBridgeHttp({ base: httpBaseOf(pairing.bridge), device, secret: pairing.pin }),
  });
}

/**
 * Web pult served by a bridge: its own origin is the bridge (`?bridge=host:port` overrides, dev).
 * Returns the socket URL, or null when this page was not served by a bridge.
 */
export async function findBridge(): Promise<string | null> {
  const loc = globalThis.location;
  if (!loc?.host) return null;
  const param = new URLSearchParams(loc.search).get("bridge");
  const http = param ? `http://${param}` : `${loc.protocol}//${loc.host}`;
  try {
    const res = await fetch(`${http}/api/health`, { cache: "no-store" });
    const body = (await res.json()) as { ok?: boolean };
    if (!body.ok) return null;
  } catch {
    return null;
  }
  return http.replace(/^http/, "ws") + "/ws";
}

/** `?pin=` of the web pult URL (the QR for browsers carries it). */
export function pinFromUrl(): string | undefined {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("pin") ?? undefined;
  } catch {
    return undefined;
  }
}
