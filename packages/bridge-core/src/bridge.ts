import { message, type OscMessage } from "@osc/core";
import {
  coerceValue,
  isPromptValue,
  promptConfirms,
  PultStore,
  reapplyAfterChange,
  type ControlValue,
  type PromptValue,
} from "@osc/controls";
import {
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ActivityEntry,
  type BridgeHealth,
  type ClientMessage,
  type ErrorCode,
  type Holder,
  type InstallationModes,
  type ServerMessage,
  type TargetStatus,
} from "@osc/protocol";
import {
  actionsOf,
  allPults,
  type Control,
  type InstallationConfig,
  type Target,
} from "@osc/schema";
import { Lease } from "./lease";
import type { Supervisor } from "./supervisor";

/** One connected pult (a phone, a browser tab, the studio's cloud pult). */
export interface Peer {
  send(msg: ServerMessage): void;
  close(): void;
}

export type LogEntry = ActivityEntry;

export interface BridgeIO {
  sendOsc(target: Target, messages: OscMessage[]): void;
  log(entry: LogEntry): void;
  now(): number;
  /** Links the installation shows in pairing mode (the network address is known to the server). */
  pairingLinks?(): { app: string; web: string; pin: string };
  /** Starts and watches the installation software (ADR-011). Restart goes through it. */
  supervisor?: Supervisor | undefined;
  /** A target stopped answering (the server re-resolves `host: "auto"`). */
  targetOffline?(target: Target): void;
}

/**
 * System OSC to the installation for the installation actions (ADR-013 addendum, ADR-016).
 * Flash and restart are one-shot; blackout, idle and pause carry 1 / 0 and are re-sent when a
 * target comes back online, so a restarted project picks up the current state.
 */
export const OSC_ACTION = {
  flash: "/otakoyi/flash",
  restart: "/otakoyi/restart",
  blackout: "/otakoyi/blackout",
  idle: "/otakoyi/idle",
  pause: "/otakoyi/pause",
} as const;

/** Activity entries kept for the drawer and `/api/activity`; the last WELCOME_ACTIVITY go in `welcome`. */
export const ACTIVITY_SIZE = 200;
export const WELCOME_ACTIVITY = 50;
/** Repeated `set`s of one control by one device within this window are one activity line. */
const SET_COALESCE_MS = 2000;

/** How long the pairing QR stays on the installation's output. */
export const PAIRING_MS = 2 * 60 * 1000;

/**
 * System OSC between the bridge and the installation (not part of any pult):
 * - bridge → installation  `/otakoyi/pair  show:int  secondsLeft:int  app:str  web:str  pin:str`
 * - installation → bridge  `/otakoyi/pair/request` (e.g. Ctrl+Shift+P on the installation machine)
 */
export const OSC_PAIR = "/otakoyi/pair";
export const OSC_PAIR_REQUEST = "/otakoyi/pair/request";
/** Telemetry convention (docs/integration.md): the installation's frame rate, about once a second. */
export const OSC_FPS = "/sys/fps";

export interface BridgeAuth {
  /** Installation PIN for clients on the local network. Unset = no PIN (dev only). */
  clientPin?: string | undefined;
  /** Studio key. Unset = studio role refused. */
  studioKey?: string | undefined;
}

/** Feedback older than this marks the target offline. */
export const FEEDBACK_TIMEOUT_MS = 5000;

interface Session {
  peer: Peer;
  holder: Holder | null; // null until hello succeeds
  connectedAt: number;
}

/**
 * The bridge's core, free of sockets so it can be tested directly.
 * Owns the shared state of every pult, the control lease and the command log,
 * and is the only place that turns device actions into OSC.
 */
export class Bridge {
  readonly stores = new Map<string, PultStore>();
  readonly lease = new Lease();
  private sessions = new Map<Peer, Session>();
  private lastFeedback = new Map<string, number>();
  private online = new Map<string, boolean>();
  /** Device whose `set` is being applied; null while applying installation feedback. */
  private applyingFor: Peer | null = null;
  /** Device behind a value applied over HTTP (no socket of its own). */
  private applyingBy: string | null = null;
  /** Latched installation state (blackout, idle, pause). */
  readonly modes: InstallationModes = { blackout: false, idle: false, pause: false };
  private activityRing: ActivityEntry[] = [];
  private activityPending: ActivityEntry[] = [];
  /** Prompts waiting for the installation to confirm, by `pult/control`. */
  private promptPending = new Map<
    string,
    {
      pult: string;
      control: Extract<Control, { type: "prompt" }>;
      sent: PromptValue;
      seq: number;
      until: number;
    }
  >();
  private promptSeq = 0;
  /** When this bridge started (epoch ms), for the uptime in `health()`. */
  readonly startedAt: number;
  /** Last `/sys/fps` the installation reported (telemetry), or null. */
  private fps: number | null = null;

  constructor(
    readonly config: InstallationConfig,
    private io: BridgeIO,
    private auth: BridgeAuth = {},
  ) {
    this.startedAt = io.now();
    // The System screen (ADR-018) runs as one more pult: same state, lease, echo and activity.
    for (const pult of allPults(config)) {
      const store = new PultStore(
        config,
        pult,
        { send: (t, m) => io.sendOsc(t, m) },
        { now: () => io.now() },
      );
      store.onChange((id, value) => this.broadcastValue(pult.id, id, value));
      this.stores.set(pult.id, store);
    }
    for (const t of config.targets) this.online.set(t.id, false);
  }

  connect(peer: Peer) {
    this.sessions.set(peer, { peer, holder: null, connectedAt: this.io.now() });
  }

  disconnect(peer: Peer) {
    const s = this.sessions.get(peer);
    this.sessions.delete(peer);
    if (!s?.holder) return;
    this.log("disconnect", s.holder);
    if (this.lease.release(s.holder.device)) this.handOver();
  }

  handle(peer: Peer, raw: string) {
    const s = this.sessions.get(peer);
    if (!s) return;
    const msg = parseClientMessage(raw);
    if (!msg) return this.error(peer, "bad-message", "Malformed message");

    if (msg.t === "hello") return this.hello(s, msg);
    if (!s.holder) return this.error(peer, "auth", "Say hello first");
    const who = s.holder;

    switch (msg.t) {
      case "ping":
        return peer.send({ t: "pong", at: msg.at });
      case "take":
        if (this.lease.take(who)) this.leaseChanged(who);
        else if (!this.lease.canSend(who.device))
          this.error(peer, "no-lease", "The studio is controlling this installation");
        return;
      case "release":
        if (this.lease.release(who.device)) this.handOver(who.device);
        return;
      case "pairing":
        if (who.role !== "studio")
          return this.error(peer, "no-lease", "Only the studio can show the pairing QR");
        return this.setPairing(msg.show, who);
      case "action":
      case "mode": {
        const r = this.installationAction(msg, who);
        if (r) this.error(peer, r.code, r.message);
        return;
      }
      case "set": {
        if (!this.lease.canSend(who.device)) {
          this.log("rejected", who, { reason: "no-lease", pult: msg.pult, id: msg.id });
          return this.error(peer, "no-lease", "Another device is in control");
        }
        const store = this.stores.get(msg.pult);
        const control = store?.control(msg.id);
        if (!store || !control) return this.error(peer, "unknown-control", `${msg.pult}/${msg.id}`);
        if (control.studioOnly && who.role !== "studio")
          return this.error(peer, "no-lease", "Studio-only control");
        const value = coerceValue(control, msg.value);
        if (value === undefined) return this.error(peer, "bad-value", `${msg.pult}/${msg.id}`);
        this.applyingFor = peer;
        try {
          store.interact(control, value);
        } finally {
          this.applyingFor = null;
        }
        this.afterSend(msg.pult, control, value);
        this.log("set", who, { pult: msg.pult, id: msg.id, value });
        return;
      }
    }
  }

  /** OSC that came back from the installation. */
  feedback(targetId: string, msg: OscMessage) {
    this.lastFeedback.set(targetId, this.io.now());
    this.io.supervisor?.heartbeat(targetId);
    if (msg.address === OSC_PAIR_REQUEST)
      return this.setPairing(!this.pairingUntil, { device: `target:${targetId}` });
    if (msg.address === OSC_FPS) {
      const a = msg.args[0];
      const v = a && "value" in a ? a.value : undefined;
      if (typeof v === "number" && Number.isFinite(v)) this.fps = v;
    }
    this.checkPromptConfirm(msg);
    for (const store of this.stores.values()) store.receive(msg);
  }

  /** Pairing mode: the installation shows the QR (with the PIN) for PAIRING_MS, then hides it. */
  pairingUntil: number | null = null;

  setPairing(show: boolean, who?: Partial<Holder>) {
    this.pairingUntil = show ? this.io.now() + PAIRING_MS : null;
    this.log("pairing", who, { show });
    this.sendPairing();
    this.broadcast({ t: "pairing", until: this.pairingUntil });
  }

  private sendPairing() {
    const links = this.io.pairingLinks?.();
    const left = this.pairingUntil
      ? Math.max(0, Math.ceil((this.pairingUntil - this.io.now()) / 1000))
      : 0;
    const msg =
      this.pairingUntil && links
        ? message(OSC_PAIR, 1, left, links.app, links.web, links.pin)
        : message(OSC_PAIR, 0, 0, "", "", "");
    for (const t of this.config.targets) this.io.sendOsc(t, [msg]);
  }

  status(): TargetStatus[] {
    const now = this.io.now();
    return this.config.targets.map((t) => {
      const at = this.lastFeedback.get(t.id) ?? null;
      return {
        id: t.id,
        online: at !== null && now - at < FEEDBACK_TIMEOUT_MS,
        lastFeedbackAt: at,
      };
    });
  }

  /**
   * Call about once a second: heartbeat pings, pairing countdown, target status (broadcast when it
   * changes) and the batched activity feed.
   */
  tick() {
    for (const t of this.config.targets)
      if (t.heartbeat) this.io.sendOsc(t, [message(t.heartbeat)]);
    if (this.pairingUntil !== null) {
      if (this.io.now() >= this.pairingUntil) this.setPairing(false);
      else this.sendPairing(); // countdown + reaches an installation that restarted meanwhile
    }
    const st = this.status();
    if (st.some((t) => this.online.get(t.id) !== t.online)) {
      for (const t of st) {
        const was = this.online.get(t.id);
        this.online.set(t.id, t.online);
        const target = this.config.targets.find((x) => x.id === t.id)!;
        if (t.online && !was) this.sendModes(target); // a restarted project gets the current state
        if (!t.online && was) this.io.targetOffline?.(target);
      }
      this.broadcastStatus(st);
    }
    for (const [key, p] of this.promptPending)
      if (this.io.now() >= p.until) {
        this.promptPending.delete(key);
        this.broadcast({ t: "prompt", pult: p.pult, id: p.control.id, state: "error", seq: p.seq });
      }
    if (this.activityPending.length) {
      const entries = this.activityPending;
      this.activityPending = [];
      this.broadcast({ t: "activity", entries });
    }
  }

  /**
   * Health and telemetry for `/api/health` and the Installation panel: target status, latched
   * modes, connected devices, uptime and the installation's last reported FPS.
   */
  health(): BridgeHealth {
    const now = this.io.now();
    return {
      ok: true,
      protocol: PROTOCOL_VERSION,
      installation: this.config.installation,
      targets: this.status().map((t) => ({
        ...t,
        lastSeen: t.lastFeedbackAt === null ? null : new Date(t.lastFeedbackAt).toISOString(),
      })),
      modes: { ...this.modes },
      devices: this.devices.length,
      startedAt: this.startedAt,
      uptimeS: Math.max(0, Math.floor((now - this.startedAt) / 1000)),
      fps: this.fps,
    };
  }

  /** Recent activity, oldest first. */
  activity(limit = ACTIVITY_SIZE): ActivityEntry[] {
    return this.activityRing.slice(-Math.max(0, limit));
  }

  /**
   * Flash / restart / blackout and the idle / pause modes. Only the lease holder or the studio,
   * only what the installation supports (`installation.actions`). Returns an error or null.
   */
  installationAction(
    msg: Extract<ClientMessage, { t: "action" | "mode" }>,
    who: Holder,
  ): { code: ErrorCode; message: string } | null {
    const name = msg.t === "action" ? msg.name : msg.mode;
    if (!actionsOf(this.config).includes(name))
      return { code: "unsupported", message: `This installation has no ${name}` };
    if (!this.canControl(who)) {
      this.log("rejected", who, { reason: "no-lease", action: name });
      return { code: "no-lease", message: "Another device is in control" };
    }
    if (msg.t === "mode" || name === "blackout") {
      const on = msg.on;
      if (typeof on !== "boolean") return { code: "bad-message", message: `${name} needs on` };
      const key = name as keyof InstallationModes;
      this.modes[key] = on;
      for (const t of this.config.targets)
        this.io.sendOsc(t, [message(OSC_ACTION[key], on ? 1 : 0)]);
      this.log(msg.t, who, { name, on });
      this.broadcastStatus(this.status());
      return null;
    }
    for (const t of this.config.targets) this.io.sendOsc(t, [message(OSC_ACTION[name])]);
    if (name === "restart" && this.io.supervisor)
      for (const t of this.config.targets)
        if (t.runtime)
          this.io.supervisor
            .restart(t)
            .catch((e: Error) => this.log("action", who, { name, target: t.id, error: e.message }));
    this.log("action", who, { name });
    return null;
  }

  private sendModes(t: Target) {
    for (const key of ["blackout", "idle", "pause"] as const)
      if (key === "blackout" || actionsOf(this.config).includes(key))
        this.io.sendOsc(t, [message(OSC_ACTION[key], this.modes[key] ? 1 : 0)]);
  }

  private broadcastStatus(targets: TargetStatus[]) {
    this.broadcast({ t: "status", targets, modes: { ...this.modes } });
  }

  /**
   * Authenticate an HTTP request (image upload, prompt presets) with the same secrets as `hello`.
   * Returns who is asking, or null.
   */
  authorize(secret: string | undefined, device: string | undefined): Holder | null {
    const dev = (device ?? "").slice(0, 64) || "http";
    if (this.auth.studioKey && secret && same(this.auth.studioKey, secret))
      return { device: dev, role: "studio" };
    if (
      this.auth.clientPin === undefined ||
      (secret !== undefined && same(this.auth.clientPin, secret))
    )
      return { device: dev, role: "client" };
    return null;
  }

  /** May this caller change controls right now (holds the lease, or is the studio)? */
  canControl(who: Holder): boolean {
    return who.role === "studio" || this.lease.canSend(who.device);
  }

  /**
   * Apply a value the bridge itself decided (e.g. the path of a validated image upload): sends the
   * OSC, syncs every device and logs it. The caller has checked `canControl`.
   */
  applyValue(pult: string, id: string, value: ControlValue, who: Holder): boolean {
    const store = this.stores.get(pult);
    const control = store?.control(id);
    if (!store || !control) return false;
    if (control.studioOnly && who.role !== "studio") return false;
    this.applyingBy = who.device;
    try {
      store.interact(control, value);
    } finally {
      this.applyingBy = null;
    }
    this.afterSend(pult, control, value);
    this.log("set", who, { pult, id, value });
    return true;
  }

  /**
   * A control's data on the bridge changed (prompt presets, image library): log it and tell every
   * pult to fetch it again.
   */
  dataChanged(
    pult: string,
    id: string,
    kind: "prompts" | "images",
    who: Holder,
    extra: Record<string, unknown> = {},
  ) {
    this.log(kind === "prompts" ? "prompt" : "image", who, { pult, id, ...extra });
    this.broadcast({ t: "data", pult, id, kind });
  }

  /**
   * A preset changed or was deleted: if it is live on the control, send the control again with
   * the preset re-resolved (a deleted preset empties its slot: the installation's base look).
   */
  reapplyPrompt(
    pult: string,
    id: string,
    presets: readonly { id: string; text: string; on: boolean }[],
    presetId: string,
    who: Holder,
  ): boolean {
    const store = this.stores.get(pult);
    const control = store?.control(id);
    const current = store?.get(id);
    if (!store || control?.type !== "prompt" || !isPromptValue(current)) return false;
    const next = reapplyAfterChange(current, presets, presetId, control.maxLength);
    return next ? this.applyValue(pult, id, next, who) : false;
  }

  /** After a control sent OSC: a prompt waits for the installation to confirm (Applying → On / Error). */
  private afterSend(pult: string, control: Control, value: ControlValue) {
    if (control.type !== "prompt" || !isPromptValue(value)) return;
    const seq = ++this.promptSeq;
    const key = `${pult}/${control.id}`;
    if (control.confirmMs === 0) {
      this.promptPending.delete(key);
      return this.broadcast({ t: "prompt", pult, id: control.id, state: "applied", seq });
    }
    this.promptPending.set(key, {
      pult,
      control,
      sent: value,
      seq,
      until: this.io.now() + control.confirmMs,
    });
    this.broadcast({ t: "prompt", pult, id: control.id, state: "applying", seq });
  }

  private checkPromptConfirm(msg: OscMessage) {
    if (!this.promptPending.size) return;
    const first = msg.args[0];
    const text = first && "value" in first ? first.value : undefined;
    for (const [key, p] of this.promptPending)
      if (
        promptConfirms(p.control.address, p.sent, p.control.blend, { address: msg.address, text })
      ) {
        this.promptPending.delete(key);
        this.broadcast({
          t: "prompt",
          pult: p.pult,
          id: p.control.id,
          state: "applied",
          seq: p.seq,
        });
      }
  }

  get devices(): Holder[] {
    return [...this.sessions.values()].flatMap((s) => (s.holder ? [s.holder] : []));
  }

  // ---------------------------------------------------------------------------------------------

  private hello(s: Session, msg: Extract<ReturnType<typeof parseClientMessage>, { t: "hello" }>) {
    if (s.holder) return this.error(s.peer, "bad-message", "Already said hello");
    if (msg.v < MIN_PROTOCOL_VERSION || msg.v > PROTOCOL_VERSION) {
      this.error(
        s.peer,
        "version",
        `Bridge speaks protocol ${MIN_PROTOCOL_VERSION}–${PROTOCOL_VERSION}`,
      );
      return s.peer.close();
    }
    const expected = msg.role === "studio" ? this.auth.studioKey : this.auth.clientPin;
    const refused =
      (msg.role === "studio" && !expected) ||
      (expected !== undefined && !same(expected, msg.secret ?? ""));
    if (refused) {
      this.log("rejected", { device: msg.device, role: msg.role }, { reason: "auth" });
      this.error(s.peer, "auth", "Wrong PIN");
      return s.peer.close();
    }

    // The same device reconnecting replaces its old connection (and keeps the lease).
    for (const other of this.sessions.values())
      if (other !== s && other.holder?.device === msg.device) {
        this.sessions.delete(other.peer);
        other.peer.close();
      }

    s.holder = { device: msg.device, name: msg.name, role: msg.role };
    this.log("connect", s.holder);
    s.peer.send({
      t: "welcome",
      v: PROTOCOL_VERSION,
      config: this.config,
      state: Object.fromEntries([...this.stores].map(([id, st]) => [id, st.snapshot()])),
      lease: this.lease.holder,
      targets: this.status(),
      actions: actionsOf(this.config),
      modes: { ...this.modes },
      activity: this.activity(WELCOME_ACTIVITY),
    });
    if (this.lease.offer(s.holder)) this.leaseChanged(s.holder);
  }

  /** The lease became free: give it to the longest-connected client, if any. */
  private handOver(except?: string) {
    const next = [...this.sessions.values()]
      .filter((x) => x.holder && x.holder.role === "client" && x.holder.device !== except)
      .sort((a, b) => a.connectedAt - b.connectedAt)[0];
    if (next?.holder) this.lease.offer(next.holder);
    this.leaseChanged(this.lease.holder);
  }

  private leaseChanged(holder: Holder | null) {
    this.log("lease", holder ?? undefined, { holder: holder?.device ?? null });
    this.broadcast({ t: "lease", holder });
  }

  private broadcastValue(pult: string, id: string, value: ControlValue) {
    const origin = this.applyingFor;
    const by = origin ? (this.sessions.get(origin)?.holder?.device ?? null) : this.applyingBy;
    this.broadcast({ t: "value", pult, id, value, by }, origin);
  }

  private broadcast(msg: ServerMessage, except?: Peer | null) {
    for (const s of this.sessions.values()) if (s.holder && s.peer !== except) s.peer.send(msg);
  }

  private error(peer: Peer, code: ErrorCode, message: string) {
    peer.send({ t: "error", code, message });
  }

  private log(
    event: LogEntry["event"],
    who?: Partial<Holder>,
    extra: Record<string, unknown> = {},
  ) {
    const entry: ActivityEntry = {
      ts: new Date(this.io.now()).toISOString(),
      event,
      device: who?.device,
      role: who?.role,
      ...extra,
    };
    this.io.log(entry);
    this.remember(entry);
  }

  /** Add to the activity feed. A burst of moves on one control by one device is one line. */
  private remember(entry: ActivityEntry) {
    const last = this.activityRing.at(-1);
    const sameSet =
      entry.event === "set" &&
      last?.event === "set" &&
      last.device === entry.device &&
      last.pult === entry.pult &&
      last.id === entry.id &&
      Date.parse(entry.ts) - Date.parse(last.ts) < SET_COALESCE_MS;
    if (sameSet) {
      this.activityRing[this.activityRing.length - 1] = entry;
      const i = this.activityPending.lastIndexOf(last!);
      if (i >= 0) this.activityPending[i] = entry;
      else this.activityPending.push(entry);
      return;
    }
    this.activityRing.push(entry);
    if (this.activityRing.length > ACTIVITY_SIZE) this.activityRing.shift();
    this.activityPending.push(entry);
    if (this.activityPending.length > ACTIVITY_SIZE) this.activityPending.shift();
  }
}

/** Constant-time string comparison (no Node `crypto`, so the core also runs inside the app). */
export function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
