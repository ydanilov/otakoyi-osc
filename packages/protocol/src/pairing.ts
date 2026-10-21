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
