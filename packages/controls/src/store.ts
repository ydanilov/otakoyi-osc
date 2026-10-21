import { argValue, type OscMessage } from "@osc/core";
import { initialValue, isGroupValue, messagesFor, type ControlValue } from "./logic";
import { knobMode, wrapHue } from "./modes";
import type { PromptAck } from "./prompt";
import {
  targetOf,
  type AnyControl,
  type Control,
  type InstallationConfig,
  type Pult,
  type Target,
} from "@osc/schema";

/**
 * Who may send right now. Mirrors the bridge's control lease:
 * one device controls, others view; a studio session always wins.
 */
export type ControlMode = "control" | "view" | "studio-has-control" | "offline";

export interface Transport {
  send(target: Target, messages: OscMessage[]): void;
  /**
   * Optional: take the raw interaction instead of OSC. A pult connected to a bridge uses it to send
   * `{pult, id, value}`; the bridge validates it and is the one that sends OSC.
   */
  interact?(pult: string, control: Control, value: ControlValue): void;
}

type Listener = () => void;

/**
 * Shared state of every control in a pult. The app and the web pult keep one store per pult;
 * the bridge broadcasts changes so every device shows the same values.
 */
export class PultStore {
  private values = new Map<string, ControlValue>();
  private listeners = new Map<string, Set<Listener>>();
  private modeListeners = new Set<Listener>();
  private changeListeners = new Set<(id: string, value: ControlValue) => void>();
  private byFeedback = new Map<string, Control[]>();
  /** Per control: confirmation of the last prompt sent, and a revision of its server-side data. */
  private acks = new Map<string, PromptAck>();
  private revs = new Map<string, number>();
  private metaListeners = new Map<string, Set<Listener>>();
  private localSeq = 0;
  mode: ControlMode = "control";

  constructor(
    readonly config: InstallationConfig,
    readonly pult: Pult,
    private transport: Transport,
  ) {
    for (const c of this.controls()) {
      this.values.set(c.id, initialValue(c));
      const fb = c.feedback ?? ("address" in c && !c.address.includes("{") ? c.address : undefined);
      // A button group listens on every button's own address.
      const addrs =
        c.type === "buttonGroup" && !c.feedback ? c.buttons.map((b) => b.address) : [fb];
      for (const a of addrs) if (a) this.byFeedback.set(a, [...(this.byFeedback.get(a) ?? []), c]);
    }
  }

  controls(): Control[] {
    return this.pult.pages
      .flatMap((p) => p.controls)
      .filter((c): c is Control => c.type !== "unsupported");
  }

  get(id: string): ControlValue {
    return this.values.get(id) ?? null;
  }

  subscribe(id: string, fn: Listener): () => void {
    const set = this.listeners.get(id) ?? new Set();
    set.add(fn);
    this.listeners.set(id, set);
    return () => set.delete(fn);
  }

  subscribeMode(fn: Listener): () => void {
    this.modeListeners.add(fn);
    return () => this.modeListeners.delete(fn);
  }

  /** Every value change, from any source. The bridge uses it to broadcast state to devices. */
  onChange(fn: (id: string, value: ControlValue) => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  /** Current value of every control, for a device that just connected. */
  snapshot(): Record<string, ControlValue> {
    return Object.fromEntries(this.values);
  }

  control(id: string): Control | undefined {
    return this.controls().find((c) => c.id === id);
  }

  /** Confirmation state of the last prompt this control sent (bridge `prompt` message). */
  ack(id: string): PromptAck | null {
    return this.acks.get(id) ?? null;
  }

  /** An older ack never replaces a newer one. */
  setAck(id: string, ack: PromptAck) {
    const cur = this.acks.get(id);
    if (cur && cur.seq > ack.seq) return;
    if (cur && cur.seq === ack.seq && cur.state === ack.state) return;
    this.acks.set(id, ack);
    this.metaListeners.get(id)?.forEach((f) => f());
  }

  /** Bumped when a control's data on the bridge changed (prompt presets, image library). */
  rev(id: string): number {
    return this.revs.get(id) ?? 0;
  }

  bumpRev(id: string) {
    this.revs.set(id, this.rev(id) + 1);
    this.metaListeners.get(id)?.forEach((f) => f());
  }

  subscribeMeta(id: string, fn: Listener): () => void {
    const set = this.metaListeners.get(id) ?? new Set();
    set.add(fn);
    this.metaListeners.set(id, set);
    return () => set.delete(fn);
  }

  setMode(mode: ControlMode) {
    this.mode = mode;
    this.modeListeners.forEach((f) => f());
  }

  get canSend(): boolean {
    return this.mode === "control";
  }

  /** A local interaction: update state and send OSC. Ignored unless this device holds control. */
  interact(control: AnyControl, value: ControlValue): boolean {
    if (control.type === "unsupported" || !this.canSend) return false;
    this.set(control.id, value);
    if (this.transport.interact) {
      this.transport.interact(this.pult.id, control, value);
      return true;
    }
    const msgs = messagesFor(control, value);
    const target = targetOf(this.config, this.pult, control);
    if (msgs.length && target) this.transport.send(target, msgs);
    // Direct OSC (no bridge) has nobody to confirm a prompt: treat it as applied.
    if (control.type === "prompt")
      this.setAck(control.id, { state: "applied", seq: ++this.localSeq });
    return true;
  }

  /** A value from another device (via the bridge) or feedback from the installation. */
  set(id: string, value: ControlValue) {
    if (sameValue(this.values.get(id), value)) return;
    this.values.set(id, value);
    this.listeners.get(id)?.forEach((f) => f());
    this.changeListeners.forEach((f) => f(id, value));
  }

  /** Apply an incoming OSC message to every control listening on its address. */
  receive(msg: OscMessage) {
    for (const c of this.byFeedback.get(msg.address) ?? []) {
      const v = feedbackValue(c, msg, this.get(c.id));
      if (v !== undefined) this.set(c.id, v);
    }
  }
}

function feedbackValue(
  c: Control,
  msg: OscMessage,
  current: ControlValue,
): ControlValue | undefined {
  const vals = msg.args.map(argValue);
  const first = vals[0];
  switch (c.type) {
    case "fader":
      // An endless jog has no position the installation could report.
      return c.mode !== "relative" && typeof first === "number" ? first : undefined;
    case "knob": {
      const mode = knobMode(c);
      if (mode === "relative" || typeof first !== "number") return undefined;
      return mode === "hue" ? wrapHue(first) : first;
    }
    case "meter":
      return typeof first === "number" ? first : undefined;
    case "buttonGroup": {
      const b = c.buttons.find((x) => x.address === msg.address);
      if (!b) return undefined;
      const lit = first === true || first === 1 || (b.value !== undefined && first === b.value);
      const on = new Set(isGroupValue(current) ? current.on : []);
      if (lit) on.add(b.id);
      else on.delete(b.id);
      return { on: c.buttons.filter((x) => on.has(x.id)).map((x) => x.id) };
    }
    case "toggle":
      return first === true || first === 1 || first === c.on[0];
    case "label":
      return first === undefined || first === null ? "" : String(first);
    case "xy": {
      const [x, y] = vals;
      if (typeof x !== "number" || typeof y !== "number") return undefined;
      return { x: (x - c.x.min) / (c.x.max - c.x.min), y: (y - c.y.min) / (c.y.max - c.y.min) };
    }
    case "segmented": {
      const i = c.options.findIndex((o) => o.value === first);
      return i >= 0 ? i : undefined;
    }
    case "sceneList":
      return c.scenes.find((s) => s.value === first)?.id;
    case "colorPicker":
      return typeof first === "string" && first.startsWith("#") ? first : undefined;
    default:
      return undefined;
  }
}

function sameValue(a: ControlValue | undefined, b: ControlValue): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
