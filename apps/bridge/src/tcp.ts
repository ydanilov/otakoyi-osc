import { connect as netConnect, type Socket } from "node:net";
import {
  SlipDecoder,
  decodePacket,
  encodeMessage,
  messagesOf,
  slipEncode,
  type OscMessage,
} from "@osc/core";

/** Reconnect delays (ms); the last one repeats. */
export const TCP_BACKOFF_MS = [250, 500, 1000, 2000, 5000, 10000];
/** Messages kept while disconnected; older ones are dropped (latched modes are re-sent anyway). */
export const TCP_QUEUE = 64;

export interface TcpLinkOptions {
  /** Where to connect right now (re-read on every attempt, so a re-resolved host is picked up). */
  address(): { host: string; port: number };
  onMessage(msg: OscMessage): void;
  onState?(connected: boolean): void;
  /** Injected for tests. */
  connect?: (port: number, host: string) => Socket;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (t: unknown) => void;
}

/**
 * OSC 1.1 over TCP with SLIP framing (ADR-016): one connection per target, feedback is read on the
 * same socket, reconnect with backoff. Sends while disconnected are queued (bounded).
 */
export class TcpLink {
  private socket: Socket | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private closed = false;
  private queue: Uint8Array[] = [];
  connected = false;

  constructor(private opts: TcpLinkOptions) {}

  start() {
    this.closed = false;
    this.open();
  }

  send(msgs: OscMessage[]) {
    for (const m of msgs) {
      const frame = slipEncode(encodeMessage(m));
      if (this.connected && this.socket) this.socket.write(frame);
      else {
        this.queue.push(frame);
        if (this.queue.length > TCP_QUEUE) this.queue.shift();
      }
    }
  }

  /** Drop the connection and connect again now (e.g. the host was re-resolved). */
  reconnect() {
    this.attempt = 0;
    this.socket?.destroy();
  }

  close() {
    this.closed = true;
    if (this.timer !== null) (this.opts.clearTimeout ?? clearTimeout)(this.timer as never);
    this.socket?.destroy();
    this.socket = null;
  }

  private open() {
    if (this.closed) return;
    const { host, port } = this.opts.address();
    const sock = (this.opts.connect ?? ((p, h) => netConnect(p, h)))(port, host);
    this.socket = sock;
    const decoder = new SlipDecoder();
    sock.setNoDelay?.(true);
    sock.on("connect", () => {
      this.attempt = 0;
      this.setConnected(true);
      for (const f of this.queue.splice(0)) sock.write(f);
    });
    sock.on("data", (chunk: Buffer) => {
      for (const packet of decoder.push(new Uint8Array(chunk))) {
        try {
          for (const m of messagesOf(decodePacket(packet))) this.opts.onMessage(m);
        } catch {
          // A malformed packet from the network is dropped; the stream stays in sync thanks to SLIP.
        }
      }
    });
    sock.on("error", () => {});
    sock.on("close", () => {
      if (this.socket !== sock) return;
      this.socket = null;
      this.setConnected(false);
      if (this.closed) return;
      const delay = TCP_BACKOFF_MS[Math.min(this.attempt++, TCP_BACKOFF_MS.length - 1)]!;
      this.timer = (this.opts.setTimeout ?? setTimeout)(() => {
        this.timer = null;
        this.open();
      }, delay);
    });
  }

  private setConnected(v: boolean) {
    if (this.connected === v) return;
    this.connected = v;
    this.opts.onState?.(v);
  }
}
