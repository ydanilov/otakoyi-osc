import { createSocket, type Socket } from "node:dgram";
import { decodePacket, encodeMessage, messagesOf, type OscMessage } from "@osc/core";
import type { Target } from "@osc/schema";
import { HostResolver, type Browse } from "./resolver";
import { TcpLink } from "./tcp";

export interface TargetsOptions {
  targets: Target[];
  onFeedback(targetId: string, msg: OscMessage): void;
  browse: Browse | null;
  say(...a: unknown[]): void;
  debug?: boolean | undefined;
}

/**
 * The bridge's connections to the installation software (ADR-016): UDP (one shared send socket,
 * feedback on `feedbackPort`) or TCP with SLIP (feedback on the same socket), each reached at the
 * address the resolver picks (`host: "auto"` → mDNS → fallbacks → this machine).
 */
export async function openTargets(opts: TargetsOptions) {
  const resolver = new HostResolver(opts.browse);
  const out = createSocket("udp4");
  const feedbackSockets: Socket[] = [];
  const tcp = new Map<string, TcpLink>();
  const byId = new Map(opts.targets.map((t) => [t.id, t]));

  const decode = (targetId: string, bytes: Uint8Array, from: string) => {
    try {
      for (const m of messagesOf(decodePacket(bytes))) {
        if (opts.debug) opts.say("osc in", targetId, from, m.address, JSON.stringify(m.args));
        opts.onFeedback(targetId, m);
      }
    } catch (e) {
      // Malformed packet from the network: ignore it (log it when debugging).
      if (opts.debug) opts.say("bad packet", from, (e as Error).message);
    }
  };

  for (const t of opts.targets) {
    if (t.host === "auto")
      void resolver
        .resolve(t)
        .then((r) => opts.say(`target ${t.id} → ${r.host}:${r.port} (${r.via})`));
    if (t.protocol === "tcp") {
      const link = new TcpLink({
        address: () => resolver.current(t),
        onMessage: (m) => {
          if (opts.debug) opts.say("osc in", t.id, "tcp", m.address, JSON.stringify(m.args));
          opts.onFeedback(t.id, m);
        },
        onState: (up) => opts.say(`target ${t.id} tcp ${up ? "connected" : "disconnected"}`),
      });
      link.start();
      tcp.set(t.id, link);
      continue;
    }
    if (!t.feedbackPort) continue;
    const sock = createSocket({ type: "udp4", reuseAddr: true });
    sock.on("message", (buf, from) => decode(t.id, new Uint8Array(buf), from.address));
    sock.on("error", (e) => opts.say(`feedback ${t.id}:${t.feedbackPort}`, e.message));
    await new Promise<void>((ok) => sock.bind(t.feedbackPort, ok));
    feedbackSockets.push(sock);
    opts.say(`feedback from ${t.name ?? t.id} on udp ${t.feedbackPort}`);
  }

  return {
    resolver,
    send(target: Target, messages: OscMessage[]) {
      const link = tcp.get(target.id);
      if (opts.debug)
        for (const m of messages) opts.say("osc out", target.id, m.address, JSON.stringify(m.args));
      if (link) return link.send(messages);
      const { host, port } = resolver.current(target);
      for (const m of messages) out.send(encodeMessage(m), port, host);
    },
    /** The target went offline: re-resolve an auto host (and reconnect TCP to the new one). */
    async offline(target: Target) {
      if (target.host !== "auto") return;
      const before = resolver.current(target);
      const r = await resolver.next(target);
      if (r.host !== before.host || r.port !== before.port) {
        opts.say(`target ${target.id} re-resolved → ${r.host}:${r.port} (${r.via})`);
        tcp.get(target.id)?.reconnect();
      }
    },
    describe(targetId: string) {
      const t = byId.get(targetId);
      if (!t) return {};
      const r = resolver.current(t);
      return {
        protocol: t.protocol,
        host: r.host,
        port: r.port,
        via: r.via,
        ...(t.protocol === "tcp" ? { connected: tcp.get(t.id)?.connected ?? false } : {}),
      };
    },
    close() {
      for (const l of tcp.values()) l.close();
      for (const s of feedbackSockets) s.close();
      out.close();
    },
  };
}

/** mDNS browse with bonjour-service (the real network). */
export function bonjourBrowse(bonjour: {
  find(opts: { type: string; protocol: "udp" | "tcp" }): {
    on(ev: "up", fn: (s: { name: string; addresses?: string[]; port: number }) => void): void;
    stop(): void;
  };
}): Browse {
  return (type, ms) =>
    new Promise((ok) => {
      const found: { name: string; addresses: string[]; port: number }[] = [];
      const browser = bonjour.find({ type: type.name, protocol: type.protocol });
      browser.on("up", (s) =>
        found.push({ name: s.name, addresses: s.addresses ?? [], port: s.port }),
      );
      setTimeout(() => {
        browser.stop();
        ok(found);
      }, ms);
    });
}
