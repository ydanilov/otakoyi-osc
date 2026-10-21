/**
 * Pult side of the bridge's HTTP API for media and prompt presets (ADR-015). Same auth as the
 * socket: the installation PIN (or studio key) and the device id that holds the lease.
 * Types are structural so this package stays free of the schema.
 */

export interface ImageAssetDto {
  id: string;
  pultId: string;
  controlId: string;
  name: string;
  format: string;
  bytes: number;
  path: string;
  createdAt: string;
}

export interface PromptPresetDto {
  id: string;
  pultId: string;
  controlId: string;
  label: string;
  text: string;
  on: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BridgeHttpOptions {
  /** http(s)://host:port of the bridge. */
  base: string;
  device: string;
  secret?: string | undefined;
  fetch?: typeof fetch;
}

export class BridgeHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** ws://host:port/ws → http://host:port */
export function httpBaseOf(socketUrl: string): string {
  const u = new URL(socketUrl);
  u.protocol = u.protocol === "wss:" ? "https:" : "http:";
  u.pathname = "";
  u.search = "";
  return u.toString().replace(/\/$/, "");
}

export function createBridgeHttp(opts: BridgeHttpOptions) {
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const q = (pult: string, control: string) =>
    `pult=${encodeURIComponent(pult)}&control=${encodeURIComponent(control)}`;
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await f(`${opts.base}${path}`, {
      ...init,
      headers: {
        "x-otakoyi-device": opts.device,
        ...(opts.secret !== undefined ? { "x-otakoyi-secret": opts.secret } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new BridgeHttpError(res.status, body.error ?? `HTTP ${res.status}`);
    return body as T;
  }
  const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    images: {
      list: (pult: string, control: string) =>
        call<ImageAssetDto[]>(`/api/images?${q(pult, control)}`),
      upload: (pult: string, control: string, body: Blob | ArrayBuffer | Uint8Array, name = "") =>
        call<ImageAssetDto>(`/api/images?${q(pult, control)}&name=${encodeURIComponent(name)}`, {
          method: "POST",
          body: body as BodyInit,
        }),
      show: (id: string) =>
        call<ImageAssetDto>(`/api/images/${encodeURIComponent(id)}/show`, { method: "POST" }),
      remove: (id: string) =>
        call<{ ok: true }>(`/api/images/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },
    prompts: {
      list: (pult: string, control: string) =>
        call<PromptPresetDto[]>(`/api/prompts?${q(pult, control)}`),
      create: (pult: string, control: string, p: { label: string; text: string; on?: boolean }) =>
        call<PromptPresetDto>(`/api/prompts?${q(pult, control)}`, jsonInit("POST", p)),
      update: (id: string, patch: { label?: string; text?: string; on?: boolean }) =>
        call<PromptPresetDto>(`/api/prompts/${encodeURIComponent(id)}`, jsonInit("PATCH", patch)),
      remove: (id: string) =>
        call<{ ok: true }>(`/api/prompts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },
  };
}

export type BridgeHttp = ReturnType<typeof createBridgeHttp>;
