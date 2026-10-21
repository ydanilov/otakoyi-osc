import { argValue, type OscMessage } from "@osc/core";
import { initialValue, messagesFor, type ControlValue } from "@osc/controls";
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
  private byFeedback = new Map<string, Control[]>();
  mode: ControlMode = "control";

  constructor(
    readonly config: InstallationConfig,
    readonly pult: Pult,
    private transport: Transport,
  ) {
    for (const c of this.controls()) {
      this.values.set(c.id, initialValue(c));
      const fb = c.feedback ?? ("address" in c && !c.address.includes("{") ? c.address : undefined);
      if (fb) this.byFeedback.set(fb, [...(this.byFeedback.get(fb) ?? []), c]);
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
    const msgs = messagesFor(control, value);
    const target = targetOf(this.config, this.pult, control);
    if (msgs.length && target) this.transport.send(target, msgs);
    return true;
  }

  /** A value from another device (via the bridge) or feedback from the installation. */
  set(id: string, value: ControlValue) {
    this.values.set(id, value);
    this.listeners.get(id)?.forEach((f) => f());
  }

  /** Apply an incoming OSC message to every control listening on its address. */
  receive(msg: OscMessage) {
    for (const c of this.byFeedback.get(msg.address) ?? []) {
      const v = feedbackValue(c, msg);
      if (v !== undefined) this.set(c.id, v);
    }
  }
}

function feedbackValue(c: Control, msg: OscMessage): ControlValue | undefined {
  const vals = msg.args.map(argValue);
  const first = vals[0];
  switch (c.type) {
    case "fader":
    case "knob":
    case "meter":
      return typeof first === "number" ? first : undefined;
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
