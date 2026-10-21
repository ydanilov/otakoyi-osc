import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  SlipDecoder,
  argValue,
  decodePacket,
  encodeMessage,
  message,
  messagesOf,
  slipEncode,
  type OscMessage,
} from "@osc/core";
import { Target, type Target as TargetT } from "@osc/schema";
import { HostResolver, type Browse } from "./resolver";
import { TcpLink } from "./tcp";

const closers: (() => unknown)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

const target = (props: object): TargetT =>
  Target.parse({ id: "td", name: "TD", port: 7000, ...props });

function until<T>(fn: () => T | undefined, ms = 3000): Promise<T> {
  return new Promise((ok, fail) => {
    const start = Date.now();
    const poll = () => {
      const v = fn();
      if (v !== undefined) return ok(v);
      if (Date.now() - start > ms) return fail(new Error("timeout"));
      setTimeout(poll, 10);
    };
    poll();
  });
}

describe("HostResolver (host: auto)", () => {
  it("uses a fixed host as is", async () => {
    const r = new HostResolver(null);
    expect(await r.resolve(target({ host: "10.0.0.5" }))).toEqual({
      host: "10.0.0.5",
      port: 7000,
      via: "config",
    });
  });

  it("mDNS first, picking discovery.name, IPv4 preferred", async () => {
    const browse: Browse = async (type) => {
      expect(type).toEqual({ name: "osc", protocol: "udp" });
      return [
        { name: "Other", addresses: ["10.0.0.9"], port: 9999 },
        { name: "Lobby TD", addresses: ["fe80::1", "10.0.0.7"], port: 7001 },
      ];
    };
    const r = new HostResolver(browse);
    const t = target({ discovery: { name: "Lobby TD" } });
    expect(await r.resolve(t)).toEqual({ host: "10.0.0.7", port: 7001, via: "mdns" });
    expect(r.current(t).host).toBe("10.0.0.7");
  });

  it("falls back to fallbackHosts in order, then this machine, and moves on when offline", async () => {
    let services: { name: string; addresses: string[]; port: number }[] = [];
    const r = new HostResolver(async () => services);
    const t = target({ fallbackHosts: ["10.0.0.2", "10.0.0.3"] });
    expect(r.current(t).host).toBe("10.0.0.2"); // before resolving
    expect((await r.resolve(t)).host).toBe("10.0.0.2");
    expect((await r.next(t)).host).toBe("10.0.0.3");
    expect(await r.next(t)).toMatchObject({ host: "127.0.0.1", via: "local" });
    expect((await r.next(t)).host).toBe("10.0.0.2"); // wraps around
    services = [{ name: "TD", addresses: ["10.0.0.8"], port: 7000 }];
    expect(await r.next(t)).toMatchObject({ host: "10.0.0.8", via: "mdns" });
    services = [];
    expect((await r.next(t)).host).toBe("10.0.0.2"); // mDNS gone: back to the first fallback
  });

  it("a failing browse is the same as nothing found", async () => {
    const r = new HostResolver(async () => {
      throw new Error("no multicast");
    });
    expect(await r.resolve(target({}))).toMatchObject({ host: "127.0.0.1" });
  });
});

describe("TCP target (OSC 1.1, SLIP)", () => {
  async function fakeTd() {
    const received: OscMessage[] = [];
    const sockets: Socket[] = [];
    const server: Server = createServer((s) => {
      sockets.push(s);
      const dec = new SlipDecoder();
      s.on("data", (c) => {
        for (const p of dec.push(new Uint8Array(c))) received.push(...messagesOf(decodePacket(p)));
      });
      s.on("error", () => {});
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    closers.push(
      () =>
        new Promise((ok) => {
          for (const s of sockets) s.destroy();
          server.close(ok);
        }),
    );
    return { server, sockets, received, port: (server.address() as { port: number }).port };
  }

  it("sends SLIP-framed OSC and reads feedback on the same socket", async () => {
    const td = await fakeTd();
    const feedback: OscMessage[] = [];
    const link = new TcpLink({
      address: () => ({ host: "127.0.0.1", port: td.port }),
      onMessage: (m) => feedback.push(m),
    });
    closers.unshift(() => link.close());
    link.start();
    link.send([message("/wall/intensity", 0.5)]); // queued until connected
    await until(() => (link.connected ? true : undefined));
    link.send([message("/cue/1", 1)]);
    await until(() => (td.received.length === 2 ? true : undefined));
    expect(td.received.map((m) => m.address)).toEqual(["/wall/intensity", "/cue/1"]);

    // Feedback, split across two TCP chunks.
    const frame = slipEncode(encodeMessage(message("/sys/fps", 60)));
    td.sockets[0]!.write(frame.subarray(0, 5));
    td.sockets[0]!.write(frame.subarray(5));
    const fb = await until(() => feedback[0]);
    expect([fb.address, argValue(fb.args[0]!)]).toEqual(["/sys/fps", 60]);
  });

  it("reconnects with backoff after the installation drops the connection", async () => {
    const td = await fakeTd();
    const states: boolean[] = [];
    const link = new TcpLink({
      address: () => ({ host: "127.0.0.1", port: td.port }),
      onMessage: () => {},
      onState: (up) => states.push(up),
    });
    closers.unshift(() => link.close());
    link.start();
    await until(() => (link.connected ? true : undefined));
    td.sockets[0]!.destroy();
    await until(() => (states.length >= 3 ? true : undefined)); // up, down, up again (250 ms)
    expect(states.slice(0, 3)).toEqual([true, false, true]);
    link.send([message("/after", 1)]);
    await until(() => td.received.find((m) => m.address === "/after"));
  });
});
