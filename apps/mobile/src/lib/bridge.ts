import { PultStore } from "@osc/controls";
import {
  BridgeClient,
  modeFor,
  type BridgeConnection,
  type ErrorCode,
  type Holder,
  type TargetStatus,
} from "@osc/protocol";
import { parseConfig, type InstallationConfig } from "@osc/schema";
import * as React from "react";

export interface BridgeSession {
  connection: BridgeConnection;
  config: InstallationConfig | null;
  stores: Map<string, PultStore>;
  lease: Holder | null;
  targets: TargetStatus[];
  error: { code: ErrorCode; message: string } | null;
  take(): void;
}

/** Stable per-browser/device id, so a reconnect keeps the control lease. */
export function deviceId(): string {
  const key = "otakoyi.device";
  try {
    const existing = globalThis.localStorage?.getItem(key);
    if (existing) return existing;
    const id = `web-${Math.random().toString(36).slice(2, 10)}`;
    globalThis.localStorage?.setItem(key, id);
    return id;
  } catch {
    return `web-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Connect a pult to a bridge. The bridge sends the config and the shared state; every pult gets
 * a store whose interactions go to the bridge (which validates them and sends the OSC).
 */
export function useBridge(url: string | null, secret: string | undefined): BridgeSession | null {
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);
  const ref = React.useRef<BridgeSession | null>(null);

  React.useEffect(() => {
    if (!url) return;
    const device = deviceId();
    const session: BridgeSession = {
      connection: "connecting",
      config: null,
      stores: new Map(),
      lease: null,
      targets: [],
      error: null,
      take: () => client.send({ t: "take" }),
    };
    ref.current = session;
    const applyMode = () => {
      const mode = session.connection === "open" ? modeFor(session.lease, device) : "offline";
      for (const s of session.stores.values()) s.setMode(mode);
    };
    const client = new BridgeClient({
      url,
      device,
      role: "client",
      secret,
      name: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 64) : undefined,
      onConnection(state) {
        session.connection = state;
        applyMode();
        rerender();
      },
      onMessage(msg) {
        switch (msg.t) {
          case "welcome": {
            const parsed = parseConfig(msg.config);
            if (!parsed.ok) {
              session.error = {
                code: "bad-message",
                message: "The bridge sent a config this app can't read",
              };
              break;
            }
            const cfg = parsed.config;
            // Same config revision → keep the stores (and the UI); otherwise rebuild.
            if (session.config?.installation.revision !== cfg.installation.revision) {
              session.stores = new Map(
                cfg.pults.map((p) => [
                  p.id,
                  new PultStore(cfg, p, {
                    send() {},
                    interact: (pult, control, value) =>
                      client.send({ t: "set", pult, id: control.id, value }),
                  }),
                ]),
              );
            }
            session.config = cfg;
            for (const [pult, values] of Object.entries(msg.state))
              for (const [id, v] of Object.entries(values))
                session.stores.get(pult)?.set(id, v as never);
            session.lease = msg.lease;
            session.targets = msg.targets;
            session.error = null;
            applyMode();
            break;
          }
          case "value":
            session.stores.get(msg.pult)?.set(msg.id, msg.value as never);
            return; // stores notify their own subscribers; no screen rerender needed
          case "lease":
            session.lease = msg.holder;
            applyMode();
            break;
          case "status":
            session.targets = msg.targets;
            break;
          case "error":
            session.error = { code: msg.code, message: msg.message };
            break;
          case "pong":
            return;
        }
        rerender();
      },
    });
    client.connect();
    return () => {
      client.close();
      ref.current = null;
    };
  }, [url, secret]);

  return url ? ref.current : null;
}

/**
 * Where is the bridge? The web pult served by a bridge talks to its own origin.
 * `?bridge=host:port` overrides it (dev). Native apps get it from login / discovery later.
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
