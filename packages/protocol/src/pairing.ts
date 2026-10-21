/**
 * Pairing a phone with a bridge. The bridge shows a QR (on the installation screen, or printed by
 * the studio). Scanning it with the phone camera opens the app through its URL scheme:
 *
 *   otakoyi-control://connect?bridge=ws%3A%2F%2F192.168.1.20%3A8080%2Fws&pin=2468&name=Lobby
 *
 * The app stores the bridge URL and PIN and connects. The web pult QR is a plain http URL with the
 * PIN, for devices without the app. Both only work on the installation's network.
 */
export const APP_SCHEME = "otakoyi-control";

export interface Pairing {
  /** ws:// URL of the bridge socket. */
  bridge: string;
  pin?: string | undefined;
  /** Installation name, shown while connecting. */
  name?: string | undefined;
}

export function pairingUrl(p: Pairing): string {
  const q = new URLSearchParams({ bridge: p.bridge });
  if (p.pin) q.set("pin", p.pin);
  if (p.name) q.set("name", p.name);
  return `${APP_SCHEME}://connect?${q.toString()}`;
}

/** Web pult URL for the same bridge (`ws://h:p/ws` → `http://h:p/?pin=`). */
export function webPultUrl(p: Pairing): string {
  const http = p.bridge.replace(/^ws/, "http").replace(/\/ws$/, "/");
  return p.pin ? `${http}?pin=${encodeURIComponent(p.pin)}` : http;
}

/** Port the bridge listens on unless the address says otherwise. */
export const DEFAULT_BRIDGE_PORT = 8080;

export type AddressCheck = { ok: true; bridge: string } | { ok: false; message: string };

/**
 * "Enter address and PIN" (ADR-012): the address printed under the pairing QR, as typed.
 * Accepts `192.168.1.20`, `192.168.1.20:8080`, `lobby.local:8080`, `http://…` or `ws://…/ws`, and
 * returns the bridge socket URL. Local network only, so no paths other than `/ws`.
 */
export function bridgeFromAddress(input: string): AddressCheck {
  let s = input.trim();
  if (!s) return { ok: false, message: "Enter the address shown under the QR code" };
  let secure = false;
  const scheme = /^([a-z]+):\/\//i.exec(s);
  if (scheme) {
    const p = scheme[1]!.toLowerCase();
    if (!["ws", "wss", "http", "https"].includes(p))
      return { ok: false, message: "Use an address like 192.168.1.20:8080" };
    secure = p === "wss" || p === "https";
    s = s.slice(scheme[0].length);
  }
  s = s.replace(/\/ws\/?$/, "").replace(/\/$/, "");
  const m = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(s);
  if (!m) return { ok: false, message: "Use an address like 192.168.1.20:8080" };
  const host = m[1]!;
  if (/^[\d.]+$/.test(host)) {
    const parts = host.split(".");
    if (parts.length !== 4 || parts.some((x) => x === "" || Number(x) > 255))
      return { ok: false, message: "That IP address isn't valid" };
  } else if (
    !host.startsWith("[") &&
    (host.startsWith(".") || host.endsWith(".") || host.startsWith("-"))
  )
    return { ok: false, message: "That address isn't valid" };
  const port = m[2] === undefined ? DEFAULT_BRIDGE_PORT : Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return { ok: false, message: "The port must be 1–65535" };
  return { ok: true, bridge: `${secure ? "wss" : "ws"}://${host}:${port}/ws` };
}

/** Installation PINs are 4 digits (printed under the QR). */
export const PIN_LENGTH = 4;

export function checkPin(pin: string): { ok: true } | { ok: false; message: string } {
  if (!/^\d*$/.test(pin)) return { ok: false, message: "The PIN is digits only" };
  if (pin.length !== PIN_LENGTH) return { ok: false, message: `The PIN has ${PIN_LENGTH} digits` };
  return { ok: true };
}

/** Accepts the deep link or the query params of the connect route. Only ws:// and wss:// bridges. */
export function parsePairing(input: string | Record<string, unknown>): Pairing | null {
  let params: Record<string, unknown>;
  if (typeof input === "string") {
    const q = input.indexOf("?");
    if (q < 0) return null;
    params = Object.fromEntries(new URLSearchParams(input.slice(q + 1)));
  } else params = input;
  const bridge = typeof params.bridge === "string" ? params.bridge : "";
  if (!/^wss?:\/\/[^\s/]+(\/[^\s]*)?$/.test(bridge) || bridge.length > 256) return null;
  const pin = typeof params.pin === "string" && params.pin.length <= 32 ? params.pin : undefined;
  const name = typeof params.name === "string" ? params.name.slice(0, 64) : undefined;
  return { bridge, pin, name };
}
