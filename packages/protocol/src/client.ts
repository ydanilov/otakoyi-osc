import { PROTOCOL_VERSION, type ClientMessage, type Role, type ServerMessage } from "./index";

export type BridgeConnection = "connecting" | "open" | "closed";

/** Who connects and where the bridge's messages go; the same for every transport. */
export interface TransportHandlers {
  device: string;
  name?: string | undefined;
  role: Role;
  secret?: string | undefined;
  onMessage(msg: ServerMessage): void;
  onConnection?(state: BridgeConnection): void;
}

/**
 * How a pult talks to a bridge. The app does not care whether the bridge is on the installation
 * machine (WebSocket, `BridgeClient`) or simulated in-process (`@osc/sim`, the demo): both speak
 * the same protocol messages and the same hello / welcome handshake.
 */
export interface BridgeTransport {
  readonly state: BridgeConnection;
  connect(): void;
  close(): void;
  send(msg: Exclude<ClientMessage, { t: "hello" }>): void;
}

export type TransportFactory = (handlers: TransportHandlers) => BridgeTransport;

/** A real bridge over WebSocket. */
export function webSocketTransport(
  url: string,
  WebSocketImpl?: typeof WebSocket,
): TransportFactory {
  return (h) => new BridgeClient({ ...h, url, ...(WebSocketImpl ? { WebSocketImpl } : {}) });
}

export interface BridgeClientOptions extends TransportHandlers {
  /** ws:// or wss:// URL of the bridge socket, e.g. ws://192.168.1.20:8080/ws */
  url: string;
  /** WebSocket implementation (defaults to the global one; tests pass `ws`). */
  WebSocketImpl?: typeof WebSocket;
}

const BACKOFF_MS = [250, 500, 1000, 2000, 4000];

/**
 * Pult side of the bridge protocol. Works in browsers and React Native (global WebSocket).
 * Reconnects with backoff, re-sends hello each time; the bridge answers with a fresh welcome,
 * so state never drifts after a drop. Auth and version errors stop reconnecting.
 */
export class BridgeClient implements BridgeTransport {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  state: BridgeConnection = "closed";

  constructor(private opts: BridgeClientOptions) {}

  connect() {
    this.stopped = false;
    this.open();
  }

  close() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.setState("closed");
  }

  send(msg: Exclude<ClientMessage, { t: "hello" }>) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  private open() {
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    this.setState("connecting");
    const ws = new Impl(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      const hello: ClientMessage = {
        t: "hello",
        v: PROTOCOL_VERSION,
        device: this.opts.device,
        role: this.opts.role,
        ...(this.opts.name ? { name: this.opts.name } : {}),
        ...(this.opts.secret ? { secret: this.opts.secret } : {}),
      };
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === "welcome") {
        this.attempt = 0;
        this.setState("open");
      }
      if (msg.t === "error" && (msg.code === "auth" || msg.code === "version")) this.stopped = true;
      this.opts.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setState("closed");
      if (this.stopped) return;
      const delay = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)]!;
      this.timer = setTimeout(() => this.open(), delay);
    };
  }

  private setState(s: BridgeConnection) {
    if (this.state === s) return;
    this.state = s;
    this.opts.onConnection?.(s);
  }
}
