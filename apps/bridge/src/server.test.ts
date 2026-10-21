import { createSocket } from "node:dgram";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  argValue,
  decodePacket,
  encodeMessage,
  message,
  messagesOf,
  type OscMessage,
} from "@osc/core";
import type { ServerMessage } from "@osc/protocol";
import { parseConfig } from "@osc/schema";
import { WebSocket } from "ws";
import demo from "../../../packages/schema/examples/demo-installation.json";
import { startServer } from "./server";

const closers: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

async function udp(port = 0) {
  const s = createSocket("udp4");
  await new Promise<void>((ok) => s.bind(port, "127.0.0.1", ok));
  closers.push(() => {
    s.close();
  });
  return s;
}

function until<T>(fn: () => T | undefined, ms = 2000): Promise<T> {
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

describe("bridge server (real sockets)", () => {
  it("pult → WebSocket → bridge → UDP OSC, and feedback back to the pult", async () => {
    // A fake TouchDesigner: receives OSC and can send feedback.
    const td = await udp();
    const received: OscMessage[] = [];
    td.on("message", (b) => received.push(...messagesOf(decodePacket(new Uint8Array(b)))));
    const fbProbe = await udp();
    const feedbackPort = (fbProbe.address() as { port: number }).port;
    fbProbe.close();
    closers.pop();

    const cfg = structuredClone(demo) as typeof demo;
    cfg.targets[0]!.port = (td.address() as { port: number }).port;
    cfg.targets[0]!.feedbackPort = feedbackPort;
    const parsed = parseConfig(cfg);
    if (!parsed.ok) throw new Error("config");

    const server = await startServer({
      config: parsed.config,
      port: 0,
      host: "127.0.0.1",
      logDir: await mkdtemp(join(tmpdir(), "bridge-")),
      auth: { clientPin: "1234" },
      quiet: true,
    });
    closers.push(() => server.close());

    const inbox: ServerMessage[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    closers.unshift(() => ws.close());
    ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
    await new Promise((ok) => ws.on("open", ok));
    ws.send(JSON.stringify({ t: "hello", v: 1, device: "phone", role: "client", secret: "1234" }));
    await until(() => inbox.find((m) => m.t === "lease"));

    ws.send(JSON.stringify({ t: "set", pult: "lobby", id: "intensity", value: 0.42 }));
    const sent = await until(() => received.find((m) => m.address === "/wall/intensity"));
    expect(argValue(sent.args[0]!)).toBeCloseTo(0.42, 5);

    td.send(encodeMessage(message("/sys/fps", 60)), feedbackPort, "127.0.0.1");
    const fb = await until(() => inbox.find((m) => m.t === "value" && m.id === "status"));
    expect(fb).toMatchObject({ pult: "lobby", value: "60", by: null });

    const health = await (await fetch(`http://127.0.0.1:${server.port}/api/health`)).json();
    expect(health).toMatchObject({ ok: true, protocol: 1, devices: 1 });

    // Pairing sheet: local only, shows the PIN and both QR codes.
    const pair = await (await fetch(`http://127.0.0.1:${server.port}/pair`)).text();
    expect(pair).toContain("1234");
    expect(pair.match(/<svg/g)?.length).toBe(2);
  });
});
