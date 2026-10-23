import { DebugStore, PultStore, formatDebugValue, messagesFor } from "@osc/controls";
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
  /** Protocol version the bridge answered with (welcome `v`). */
  protocol: number | null;
  /** The bridge refused this device's last quick action or mode (shortly after it was sent). */
  actionError: { name: string; message: string; at: number } | null;
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

/** An error from the bridge this soon after a quick action or mode is that action's, ms. */
export const ACTION_ERROR_MS = 3000;

/** Debug page: protocol ping and health (FPS) poll interval while it is open, ms. */
export const DEBUG_POLL_MS = 2000;

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
  /** Counters, rates and the OSC log behind the Debug page (Installation › Debug, Settings › Developer › Debug). */
  readonly debug: DebugStore;
  private debugTimer: ReturnType<typeof setInterval> | null = null;
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
    protocol: null,
    actionError: null,
  };
  /** The quick action / mode last sent, to match the bridge's error to it. */
  private pendingAction: { name: string; at: number } | null = null;

  constructor(private opts: SessionOptions) {
    this.kind = opts.kind;
    this.http = opts.http;
    this.device = opts.device;
    this.bridge = opts.bridge;
    this.pin = opts.pin;
    this.name = opts.name;
    this.now = opts.now ?? Date.now;
    this.debug = new DebugStore({ now: this.now });
  }

  /**
   * Debug page open or closed (it calls this on mount / unmount). While open, the session pings the
   * bridge (RTT) and reads its health (the installation's FPS) every DEBUG_POLL_MS; closed costs
   * nothing.
   */
  setDebug(on: boolean) {
    if (!on) {
      if (this.debugTimer) clearInterval(this.debugTimer);
      this.debugTimer = null;
      return;
    }
    if (this.debugTimer) return;
    const poll = () => {
      if (this.s.connection !== "open") return;
      this.t?.send({ t: "ping", at: this.debug.ping() });
      this.http.health().then(
        (h) => this.debug.setFps(h.fps),
        () => {},
      );
    };
    poll();
    this.debugTimer = setInterval(poll, DEBUG_POLL_MS);
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
    this.setDebug(false);
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
    this.pendingAction = { name, at: this.now() };
    this.t?.send(on === undefined ? { t: "action", name } : { t: "action", name, on });
  }

  setMode(mode: ModeName, on: boolean) {
    this.pendingAction = { name: mode, at: this.now() };
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
          this.debug.reset();
          this.stores = new Map(
            cfg.pults.map((p) => [
              p.id,
              new PultStore(cfg, p, {
                send() {},
                interact: (pult, control, value, previous) => {
                  this.t?.send({ t: "set", pult, id: control.id, value });
                  // What the bridge will send for it (the bridge is the one that sends OSC).
                  this.debug.sent(control.id, safeMessages(control, value, previous));
                },
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
          protocol: msg.v,
        });
        this.applyMode();
        return;
      }
      case "value": {
        const store = this.stores.get(msg.pult);
        store?.set(msg.id, msg.value as never);
        // Feedback from the installation (not another device's change).
        if (msg.by === null && store) {
          const c = store.control(msg.id);
          const address = c?.feedback ?? (c && "address" in c ? String(c.address) : msg.id);
          this.debug.received(address, formatDebugValue(msg.value as never));
        }
        return; // stores notify their own subscribers
      }
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
        else if (this.pendingAction && this.now() - this.pendingAction.at <= ACTION_ERROR_MS) {
          // The bridge answers an action at once; an error right after one is that action's.
          this.patch({
            actionError: { name: this.pendingAction.name, message: msg.message, at: this.now() },
          });
          this.pendingAction = null;
        }
        return;
      case "prompt":
        this.stores.get(msg.pult)?.setAck(msg.id, { state: msg.state, seq: msg.seq });
        return;
      case "data":
        this.stores.get(msg.pult)?.bumpRev(msg.id);
        return;
      case "pong":
        this.debug.pong(msg.at);
        return;
      case "pairing":
        return;
    }
  }
}

function safeMessages(...a: Parameters<typeof messagesFor>) {
  try {
    return messagesFor(...a);
  } catch {
    return [];
  }
}

const activityKey = (e: ActivityEntry) => `${e.ts}|${e.event}|${e.device ?? ""}`;

/** Is the installation answering (any target online)? */
export function installationOnline(s: Pick<SessionState, "connection" | "targets">): boolean {
  return s.connection === "open" && s.targets.length > 0 && s.targets.every((t) => t.online);
}
