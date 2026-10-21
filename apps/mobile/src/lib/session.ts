import { PultStore } from "@osc/controls";
import {
  modeFor,
  type ActionName,
  type ActivityEntry,
  type BridgeConnection,
  type BridgeHttp,
  type BridgeTransport,
  type ErrorCode,
  type Holder,
  type InstallationModes,
  type ModeName,
  type ServerMessage,
  type TargetStatus,
  type TransportFactory,
} from "@osc/protocol";
import { parseConfig, type InstallationConfig } from "@osc/schema";

/** Activity lines kept in memory (the bridge keeps 200; the welcome sends the last 50). */
export const ACTIVITY_KEEP = 200;

export type SessionKind = "bridge" | "demo";

export interface SessionError {
  code: ErrorCode | "unreachable";
  message: string;
}

/** Everything the screens read; replaced (not mutated) on every change. */
export interface SessionState {
  connection: BridgeConnection;
  config: InstallationConfig | null;
  lease: Holder | null;
  targets: TargetStatus[];
  modes: InstallationModes;
  actions: string[];
  activity: ActivityEntry[];
  error: SessionError | null;
  /** The connection was open and dropped (the "connection lost" dialog). */
  lost: boolean;
  /** When the last welcome arrived (epoch ms), or null before the first. */
  welcomedAt: number | null;
}

export interface SessionOptions {
  kind: SessionKind;
  /** Installation name known before the welcome (from the pairing). */
  name?: string | undefined;
  /** Bridge socket URL, for a real bridge (shown in Settings, used for the pairing QR). */
  bridge?: string | undefined;
  pin?: string | undefined;
  device: string;
  deviceName?: string | undefined;
  transport: TransportFactory;
  http: BridgeHttp;
  now?: () => number;
}

const NO_MODES: InstallationModes = { blackout: false, idle: false, pause: false };

/**
 * One connection to an installation — a real bridge or the in-app simulator, through the same
 * transport interface and protocol. Holds what the bridge said (config, lease, targets, modes,
 * activity) and one `PultStore` per pult whose interactions go back to the bridge. Pure TS: the
 * screens subscribe with `useSyncExternalStore`.
 */
export class Session {
  readonly kind: SessionKind;
  readonly http: BridgeHttp;
  readonly device: string;
  readonly bridge: string | undefined;
  readonly pin: string | undefined;
  readonly name: string | undefined;
  stores = new Map<string, PultStore>();
  private t: BridgeTransport | null = null;
  private listeners = new Set<() => void>();
  private now: () => number;
  private s: SessionState = {
    connection: "closed",
    config: null,
    lease: null,
    targets: [],
    modes: NO_MODES,
    actions: [],
    activity: [],
    error: null,
    lost: false,
    welcomedAt: null,
  };

  constructor(private opts: SessionOptions) {
    this.kind = opts.kind;
    this.http = opts.http;
    this.device = opts.device;
    this.bridge = opts.bridge;
    this.pin = opts.pin;
    this.name = opts.name;
    this.now = opts.now ?? Date.now;
  }

  get state(): SessionState {
    return this.s;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): SessionState => this.s;

  /** Name to show: from the config once it arrived, else from the pairing. */
  get displayName(): string {
    return this.s.config?.installation.name ?? this.name ?? "the installation";
  }

  start() {
    if (this.t) return;
    this.patch({ error: null, lost: false });
    this.t = this.opts.transport({
      device: this.device,
      name: this.opts.deviceName,
      role: "client",
      secret: this.pin,
      onConnection: (c) => {
        const wasOpen = this.s.connection === "open";
        this.patch({ connection: c, lost: this.s.lost || (wasOpen && c !== "open") });
        this.applyMode();
      },
      onMessage: (m) => this.onMessage(m),
    });
    this.t.connect();
  }

  stop() {
    this.t?.close();
    this.t = null;
    this.patch({ connection: "closed" });
  }

  /** Retry from the loading screen: a fresh connection. */
  restart() {
    this.stop();
    this.patch({ error: null, lost: false });
    this.start();
  }

  /** The transport gave up or never answered (loading screen timeout). */
  fail(error: SessionError) {
    this.patch({ error });
  }

  dismissLost() {
    this.patch({ lost: false });
  }

  take() {
    this.t?.send({ t: "take" });
  }

  action(name: ActionName, on?: boolean) {
    this.t?.send(on === undefined ? { t: "action", name } : { t: "action", name, on });
  }

  setMode(mode: ModeName, on: boolean) {
    this.t?.send({ t: "mode", mode, on });
  }

  /** Who may send: this device holds the lease, views, or the studio has control. */
  controlMode(): "control" | "view" | "studio-has-control" | "offline" {
    return this.s.connection === "open" ? modeFor(this.s.lease, this.device) : "offline";
  }

  private patch(p: Partial<SessionState>) {
    this.s = { ...this.s, ...p };
    for (const l of this.listeners) l();
  }

  private applyMode() {
    const mode = this.controlMode();
    for (const st of this.stores.values()) st.setMode(mode);
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case "welcome": {
        const parsed = parseConfig(msg.config);
        if (!parsed.ok) {
          this.patch({
            error: {
              code: "bad-message",
              message:
                parsed.reason === "newer-schema"
                  ? "This installation needs a newer version of the app"
                  : "The installation sent a config this app can't read",
            },
          });
          return;
        }
        const cfg = parsed.config;
        // Same config revision → keep the stores (and the UI); otherwise rebuild.
        if (this.s.config?.installation.revision !== cfg.installation.revision) {
          this.stores = new Map(
            cfg.pults.map((p) => [
              p.id,
              new PultStore(cfg, p, {
                send() {},
                interact: (pult, control, value) =>
                  this.t?.send({ t: "set", pult, id: control.id, value }),
              }),
            ]),
          );
        }
        for (const [pult, values] of Object.entries(msg.state))
          for (const [id, v] of Object.entries(values)) this.stores.get(pult)?.set(id, v as never);
        this.patch({
          config: cfg,
          lease: msg.lease,
          targets: msg.targets,
          modes: msg.modes ?? NO_MODES,
          actions: msg.actions ?? [],
          activity: (msg.activity ?? []).slice(-ACTIVITY_KEEP),
          error: null,
          lost: false,
          welcomedAt: this.now(),
        });
        this.applyMode();
        return;
      }
      case "value":
        this.stores.get(msg.pult)?.set(msg.id, msg.value as never);
        return; // stores notify their own subscribers
      case "lease":
        this.patch({ lease: msg.holder });
        this.applyMode();
        return;
      case "status":
        this.patch({ targets: msg.targets, ...(msg.modes ? { modes: msg.modes } : {}) });
        return;
      case "activity": {
        // The welcome already carries entries that are still in the bridge's next batch.
        const seen = new Set(this.s.activity.map(activityKey));
        const fresh = msg.entries.filter((e) => !seen.has(activityKey(e)));
        if (fresh.length)
          this.patch({ activity: [...this.s.activity, ...fresh].slice(-ACTIVITY_KEEP) });
        return;
      }
      case "error":
        // Lease / value errors are momentary; auth and version stop the connection.
        if (msg.code === "auth" || msg.code === "version")
          this.patch({ error: { code: msg.code, message: msg.message } });
        return;
      case "prompt":
        this.stores.get(msg.pult)?.setAck(msg.id, { state: msg.state, seq: msg.seq });
        return;
      case "data":
        this.stores.get(msg.pult)?.bumpRev(msg.id);
        return;
      case "pong":
      case "pairing":
        return;
    }
  }
}

const activityKey = (e: ActivityEntry) => `${e.ts}|${e.event}|${e.device ?? ""}`;

/** Is the installation answering (any target online)? */
export function installationOnline(s: Pick<SessionState, "connection" | "targets">): boolean {
  return s.connection === "open" && s.targets.length > 0 && s.targets.every((t) => t.online);
}
