import { timingSafeEqual } from "node:crypto";
import { message, type OscMessage } from "@osc/core";
import { coerceValue, PultStore, type ControlValue } from "@osc/controls";
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type ErrorCode,
  type Holder,
  type ServerMessage,
  type TargetStatus,
} from "@osc/protocol";
import type { InstallationConfig, Target } from "@osc/schema";
import { Lease } from "./lease";

/** One connected pult (a phone, a browser tab, the studio's cloud pult). */
export interface Peer {
  send(msg: ServerMessage): void;
  close(): void;
}

export interface LogEntry {
  ts: string;
  event: "connect" | "disconnect" | "set" | "lease" | "rejected" | "pairing";
  device?: string | undefined;
  role?: string | undefined;
  [k: string]: unknown;
}

export interface BridgeIO {
  sendOsc(target: Target, messages: OscMessage[]): void;
  log(entry: LogEntry): void;
  now(): number;
  /** Links the installation shows in pairing mode (the network address is known to the server). */
  pairingLinks?(): { app: string; web: string; pin: string };
}

/** How long the pairing QR stays on the installation's output. */
export const PAIRING_MS = 2 * 60 * 1000;

/**
 * System OSC between the bridge and the installation (not part of any pult):
 * - bridge → installation  `/otakoyi/pair  show:int  secondsLeft:int  app:str  web:str  pin:str`
 * - installation → bridge  `/otakoyi/pair/request` (e.g. Ctrl+Shift+P on the installation machine)
 */
export const OSC_PAIR = "/otakoyi/pair";
export const OSC_PAIR_REQUEST = "/otakoyi/pair/request";

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

  constructor(
    readonly config: InstallationConfig,
    private io: BridgeIO,
    private auth: BridgeAuth = {},
  ) {
    for (const pult of config.pults) {
      const store = new PultStore(config, pult, { send: (t, m) => io.sendOsc(t, m) });
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
        this.log("set", who, { pult: msg.pult, id: msg.id, value });
        return;
      }
    }
  }

  /** OSC that came back from the installation. */
  feedback(targetId: string, msg: OscMessage) {
    this.lastFeedback.set(targetId, this.io.now());
    if (msg.address === OSC_PAIR_REQUEST)
      return this.setPairing(!this.pairingUntil, { device: `target:${targetId}` });
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

  /** Call about once a second: broadcasts target status when it changes. */
  tick() {
    if (this.pairingUntil !== null) {
      if (this.io.now() >= this.pairingUntil) this.setPairing(false);
      else this.sendPairing(); // countdown + reaches an installation that restarted meanwhile
    }
    const st = this.status();
    if (st.some((t) => this.online.get(t.id) !== t.online)) {
      for (const t of st) this.online.set(t.id, t.online);
      this.broadcast({ t: "status", targets: st });
    }
  }

  get devices(): Holder[] {
    return [...this.sessions.values()].flatMap((s) => (s.holder ? [s.holder] : []));
  }

  // ---------------------------------------------------------------------------------------------

  private hello(s: Session, msg: Extract<ReturnType<typeof parseClientMessage>, { t: "hello" }>) {
    if (s.holder) return this.error(s.peer, "bad-message", "Already said hello");
    if (msg.v !== PROTOCOL_VERSION) {
      this.error(s.peer, "version", `Bridge speaks protocol ${PROTOCOL_VERSION}`);
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
    const by = origin ? (this.sessions.get(origin)?.holder?.device ?? null) : null;
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
    this.io.log({
      ts: new Date(this.io.now()).toISOString(),
      event,
      device: who?.device,
      role: who?.role,
      ...extra,
    });
  }
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
