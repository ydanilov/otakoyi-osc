import {
  Bridge,
  IMAGE_EXT,
  PromptStore,
  UNDO_WINDOW_MS,
  memoryDoc,
  newId,
  validateImage,
  type Peer,
} from "@osc/bridge-core";
import { message, type OscMessage } from "@osc/core";
import { messagesFor } from "@osc/controls";
import {
  BridgeHttpError,
  PROTOCOL_VERSION,
  type ActivityEntry,
  type BridgeConnection,
  type BridgeHealth,
  type BridgeHttp,
  type BridgeTransport,
  type ClientMessage,
  type Holder,
  type ImageAssetDto,
  type PromptPresetDto,
  type ServerMessage,
  type TransportFactory,
} from "@osc/protocol";
import type { Control, ControlOf, ImageAsset, InstallationConfig, PromptPreset } from "@osc/schema";
import { DEMO_BINDINGS, applyToPreview, controlsByAddress, type PreviewBinding } from "./bindings";
import { DEFAULT_PREVIEW, type PreviewParams } from "./preview";

/** How long the simulated installation takes to echo a value (a LAN round trip). */
export const ECHO_MS = 30;
/** Telemetry rates (docs/integration.md): FPS at 1 Hz, the audio level at 10 Hz. */
export const FPS_INTERVAL_MS = 1000;
export const AUDIO_INTERVAL_MS = 100;
/** Prompt presets the demo starts with. */
export const DEMO_PROMPTS = [
  "Aurora over a frozen lake",
  "Neon rain in a narrow street",
  "Deep sea bioluminescence",
] as const;

/** Address of the simulated audio level (the demo's meter listens on it). */
export const AUDIO_ADDRESS = "/wall/audio/level";

export interface SimulatorOptions {
  config: InstallationConfig;
  /** Address → what it does to the preview. Default: the demo installation's. */
  bindings?: Readonly<Record<string, PreviewBinding>>;
  random?: () => number;
  now?: () => number;
  /** Log every OSC message the simulated installation receives. */
  debug?: boolean;
}

/**
 * A simulated installation inside the app (ADR-012 demo mode): the same `Bridge` core and
 * protocol as `apps/bridge`, with a pretend TouchDesigner behind it instead of UDP. It echoes
 * values back as feedback (so prompts are confirmed and every device stays in sync), reports
 * `/sys/fps` (~60, with jitter) once a second and an audio level ten times a second, answers
 * installation actions and modes, keeps prompt presets and the image library in memory, and drives
 * an animated preview from the demo controls. No sockets, no files: it runs anywhere JS runs.
 */
export class Simulator {
  readonly config: InstallationConfig;
  readonly bridge: Bridge;
  readonly prompts: PromptStore;
  private images: ImageAsset[] = [];
  private previewParams: PreviewParams = {
    ...DEFAULT_PREVIEW,
    focus: { ...DEFAULT_PREVIEW.focus },
  };
  private previewListeners = new Set<() => void>();
  private controls: Map<string, Control>;
  private bindings: Readonly<Record<string, PreviewBinding>>;
  private timers: ReturnType<typeof setInterval>[] = [];
  private pending = new Set<ReturnType<typeof setTimeout>>();
  private random: () => number;
  private now: () => number;
  private t = 0;
  private debug: boolean;

  constructor(opts: SimulatorOptions) {
    this.config = opts.config;
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
    this.debug = !!opts.debug;
    this.bindings = opts.bindings ?? DEMO_BINDINGS;
    this.controls = controlsByAddress(opts.config);
    this.prompts = new PromptStore(memoryDoc<PromptPreset[]>([]), this.now);
    this.bridge = new Bridge(
      opts.config,
      {
        now: this.now,
        log: () => {},
        sendOsc: (target, msgs) => this.receive(target.id, msgs),
      },
      {}, // no PIN: the demo runs on this device only
    );
    // The light starts where the demo controls start.
    for (const store of this.bridge.stores.values())
      for (const c of store.controls())
        if ("address" in c && typeof c.address === "string" && this.bindings[c.address])
          for (const m of messagesFor(c, store.get(c.id))) this.applyPreview(m);
  }

  // --- the pretend installation -----------------------------------------------------------------

  /** OSC from the bridge to the installation. */
  private receive(targetId: string, msgs: OscMessage[]) {
    for (const m of msgs) {
      if (this.debug) console.log("[sim]", m.address, m.args);
      this.applyPreview(m);
      // System OSC is never echoed (docs/integration.md); the heartbeat is answered by telemetry.
      if (m.address.startsWith("/otakoyi/") || m.address.startsWith("/sys/")) continue;
      this.later(() => this.bridge.feedback(targetId, m), ECHO_MS);
    }
  }

  private applyPreview(m: OscMessage) {
    const next = applyToPreview(this.previewParams, m, this.bindings, this.controls);
    if (next === this.previewParams) return;
    this.previewParams = next;
    for (const l of this.previewListeners) l();
  }

  /** Current preview parameters (what the demo "wall" shows). */
  preview(): PreviewParams {
    return this.previewParams;
  }

  onPreview(fn: () => void): () => void {
    this.previewListeners.add(fn);
    return () => this.previewListeners.delete(fn);
  }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.pending.delete(id);
      fn();
    }, ms);
    this.pending.add(id);
  }

  /** Telemetry the installation sends back, as TouchDesigner would. */
  private telemetry() {
    const target = this.config.targets[0]!.id;
    this.timers.push(
      setInterval(() => {
        const fps = 60 + (this.random() - 0.5) * 3;
        this.bridge.feedback(target, message("/sys/fps", Math.round(fps * 10) / 10));
      }, FPS_INTERVAL_MS),
      setInterval(() => {
        this.t += 1;
        const p = this.previewParams;
        const quiet = p.blackout || p.pause ? 0.15 : 1;
        const t = this.t;
        const level =
          (0.3 + 0.3 * Math.abs(Math.sin(t / 7)) + 0.35 * Math.max(0, Math.sin(t / 3.1)) ** 8) *
          quiet;
        this.bridge.feedback(target, message(AUDIO_ADDRESS, Math.min(1, level)));
      }, AUDIO_INTERVAL_MS),
      setInterval(() => this.bridge.tick(), 1000),
    );
  }

  /** Start ticking: telemetry, the bridge's once-a-second tick. Idempotent. */
  start() {
    if (this.timers.length) return;
    // Online right away: the installation "answers" before the first pult connects.
    this.bridge.feedback(this.config.targets[0]!.id, message("/sys/fps", 60));
    this.telemetry();
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    for (const t of this.pending) clearTimeout(t);
    this.timers = [];
    this.pending.clear();
  }

  /**
   * A few prompt presets on every prompt control, so the demo has something to switch on,
   * long-press, reorder and delete. Call once, before the first pult connects.
   */
  async seedPrompts(texts: readonly string[] = DEMO_PROMPTS): Promise<void> {
    for (const store of this.bridge.stores.values())
      for (const c of store.controls())
        if (c.type === "prompt" && !(await this.prompts.list(store.pult.id, c.id)).length)
          for (const text of texts)
            await this.prompts.create(store.pult.id, c.id, c, {
              label: text.split(" ").slice(0, 2).join(" "),
              text,
            });
  }

  // --- transport: the protocol, without a socket ------------------------------------------------

  /**
   * A transport for `@osc/protocol`'s `TransportFactory`: the app connects to the simulated bridge
   * exactly as to a real one (hello → welcome, set, take, action, mode…). Messages are JSON
   * round-tripped and delivered asynchronously, like over a socket.
   */
  readonly transport: TransportFactory = (h) => {
    let state: BridgeConnection = "closed";
    let peer: Peer | null = null;
    const setState = (s: BridgeConnection) => {
      if (state === s) return;
      state = s;
      h.onConnection?.(s);
    };
    const t: BridgeTransport = {
      get state() {
        return state;
      },
      connect: () => {
        if (peer) return;
        setState("connecting");
        const me: Peer = {
          send: (msg: ServerMessage) => {
            const copy = JSON.parse(JSON.stringify(msg)) as ServerMessage;
            queueMicrotask(() => {
              if (peer !== me) return;
              if (copy.t === "welcome") setState("open");
              h.onMessage(copy);
            });
          },
          close: () => {
            if (peer !== me) return;
            peer = null;
            setState("closed");
          },
        };
        peer = me;
        this.bridge.connect(me);
        const hello: ClientMessage = {
          t: "hello",
          v: PROTOCOL_VERSION,
          device: h.device,
          role: h.role,
          ...(h.name ? { name: h.name } : {}),
          ...(h.secret ? { secret: h.secret } : {}),
        };
        queueMicrotask(() => peer === me && this.bridge.handle(me, JSON.stringify(hello)));
      },
      close: () => {
        const p = peer;
        peer = null;
        if (p) this.bridge.disconnect(p);
        setState("closed");
      },
      send: (msg) => {
        if (peer && state === "open") this.bridge.handle(peer, JSON.stringify(msg));
      },
    };
    return t;
  };

  // --- HTTP API, in memory (same shape as `createBridgeHttp`) ----------------------------------

  /** The bridge's HTTP API for one device, answered in-process. */
  http(device: string): BridgeHttp {
    const who: Holder = { device, role: "client" };
    const fail = (status: number, msg: string): never => {
      throw new BridgeHttpError(status, msg);
    };
    const needsLease = () => {
      if (!this.bridge.canControl(who)) fail(409, "Another device is in control");
    };
    const control = <T extends Control["type"]>(pult: string, id: string, type: T) => {
      const c = this.bridge.stores.get(pult)?.control(id);
      if (!c || c.type !== type) return fail(404, `No ${type} control ${pult}/${id}`);
      return c as ControlOf<T>;
    };
    const changed = async (pult: string, id: string, op: string, presetId?: string) => {
      this.bridge.dataChanged(pult, id, "prompts", who, { op, preset: presetId });
      if (presetId)
        this.bridge.reapplyPrompt(pult, id, await this.prompts.list(pult, id), presetId, who);
    };
    const result = <T>(
      r: { ok: true; value: T } | { ok: false; status: number; message: string },
    ) => (r.ok ? r.value : fail(r.status, r.message));
    const toBytes = async (body: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> =>
      body instanceof Uint8Array
        ? body
        : body instanceof ArrayBuffer
          ? new Uint8Array(body)
          : new Uint8Array(await body.arrayBuffer());

    return {
      images: {
        list: async (pult, id) =>
          this.images.filter((i) => i.pultId === pult && i.controlId === id) as ImageAssetDto[],
        upload: async (pult, id, body, name = "") => {
          const c = control(pult, id, "image");
          needsLease();
          const bytes = await toBytes(body);
          const check = validateImage(c, bytes);
          if (!check.ok) return fail(check.status, check.message);
          const aid = newId("img");
          const asset: ImageAsset = {
            id: aid,
            pultId: pult,
            controlId: id,
            name: name.slice(0, 128),
            format: check.format,
            bytes: bytes.length,
            path: `/demo/uploads/${aid}.${IMAGE_EXT[check.format]}`,
            createdAt: new Date(this.now()).toISOString(),
          };
          this.images = c.library
            ? [...this.images, asset]
            : [...this.images.filter((i) => !(i.pultId === pult && i.controlId === id)), asset];
          this.bridge.applyValue(pult, id, { image: asset.id, path: asset.path }, who);
          this.bridge.dataChanged(pult, id, "images", who, { op: "upload", image: asset.id });
          return asset as ImageAssetDto;
        },
        show: async (aid) => {
          const asset = this.images.find((i) => i.id === aid) ?? fail(404, "No such image");
          needsLease();
          this.bridge.applyValue(
            asset.pultId,
            asset.controlId,
            { image: asset.id, path: asset.path },
            who,
          );
          return asset as ImageAssetDto;
        },
        remove: async (aid) => {
          needsLease();
          const asset = this.images.find((i) => i.id === aid) ?? fail(404, "No such image");
          this.images = this.images.filter((i) => i !== asset);
          this.bridge.dataChanged(asset.pultId, asset.controlId, "images", who, {
            op: "delete",
            image: aid,
          });
          return { ok: true as const };
        },
      },
      prompts: {
        list: async (pult, id) => {
          control(pult, id, "prompt");
          return (await this.prompts.list(pult, id)) as PromptPresetDto[];
        },
        create: async (pult, id, p) => {
          const c = control(pult, id, "prompt");
          needsLease();
          const v = result(await this.prompts.create(pult, id, c, p));
          await changed(pult, id, "create");
          return v as PromptPresetDto;
        },
        update: async (pid, patch) => {
          const cur = await this.prompts.get(pid);
          if (!cur || cur.deletedAt) return fail(404, "No such preset");
          const c = control(cur.pultId, cur.controlId, "prompt");
          needsLease();
          const v = result(await this.prompts.update(pid, c, patch));
          await changed(cur.pultId, cur.controlId, "update", pid);
          return v as PromptPresetDto;
        },
        remove: async (pid) => {
          const cur = await this.prompts.get(pid);
          if (!cur || cur.deletedAt) return fail(404, "No such preset");
          control(cur.pultId, cur.controlId, "prompt");
          needsLease();
          await this.prompts.remove(pid);
          await changed(cur.pultId, cur.controlId, "delete", pid);
          return { ok: true as const, undoMs: UNDO_WINDOW_MS };
        },
        restore: async (pid) => {
          const cur = (await this.prompts.get(pid)) ?? fail(410, "Too late to undo");
          const c = control(cur.pultId, cur.controlId, "prompt");
          needsLease();
          const v = result(await this.prompts.restore(pid, c));
          await changed(cur.pultId, cur.controlId, "restore");
          return v as PromptPresetDto;
        },
        duplicate: async (pid) => {
          const cur = (await this.prompts.get(pid)) ?? fail(404, "No such preset");
          const c = control(cur.pultId, cur.controlId, "prompt");
          needsLease();
          const v = result(await this.prompts.duplicate(pid, c));
          await changed(cur.pultId, cur.controlId, "duplicate");
          return v as PromptPresetDto;
        },
        reorder: async (pult, id, ids) => {
          control(pult, id, "prompt");
          needsLease();
          const v = result(await this.prompts.reorder(pult, id, ids));
          await changed(pult, id, "reorder");
          return v as PromptPresetDto[];
        },
      },
      activity: async (limit?: number) => this.bridge.activity(limit) as ActivityEntry[],
      health: async () => this.bridge.health() as BridgeHealth,
    };
  }
}

/** A simulator for a config (the demo installation by default in the app). */
export function createSimulator(opts: SimulatorOptions): Simulator {
  return new Simulator(opts);
}
