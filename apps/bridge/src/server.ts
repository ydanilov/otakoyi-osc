import { createSocket, type Socket } from "node:dgram";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { decodePacket, encodeMessage, messagesOf } from "@osc/core";
import { PROTOCOL_VERSION } from "@osc/protocol";
import type { InstallationConfig, Target } from "@osc/schema";
import { WebSocketServer, type WebSocket } from "ws";
import { Bridge, type BridgeAuth, type LogEntry, type Peer } from "./bridge";

export interface ServerOptions {
  config: InstallationConfig;
  /** HTTP + WebSocket port for pults (web pult on /, socket on /ws). */
  port: number;
  /** Bind address. 0.0.0.0 to serve phones on the local network. */
  host: string;
  /** Built web pult (apps/mobile/dist). Optional. */
  webDir?: string | undefined;
  /** Directory for the JSONL command log. */
  logDir: string;
  auth: BridgeAuth;
  quiet?: boolean;
  /** Log every OSC packet in and out (OTAKOYI_DEBUG=1). */
  debug?: boolean;
}

const HELLO_TIMEOUT_MS = 5000;
const KEEPALIVE_MS = 15000;
const MAX_MESSAGE_BYTES = 64 * 1024;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

/** Resolve a target host. "auto" (mDNS discovery) is not implemented yet and means this machine. */
const hostOf = (t: Target) => (!t.host || t.host === "auto" ? "127.0.0.1" : t.host);

export async function startServer(opts: ServerOptions) {
  const say = (...a: unknown[]) => opts.quiet || console.log("[bridge]", ...a);
  await mkdir(opts.logDir, { recursive: true });

  // --- OSC out --------------------------------------------------------------------------------
  const out = createSocket("udp4");
  const io = {
    now: () => Date.now(),
    sendOsc(target: Target, messages: { address: string; args: unknown[] }[]) {
      if (target.protocol !== "udp")
        return say(`target ${target.id}: only UDP is supported for now`);
      for (const m of messages) {
        const bytes = encodeMessage(m as Parameters<typeof encodeMessage>[0]);
        if (opts.debug) say("osc out", m.address, JSON.stringify(m.args));
        out.send(bytes, target.port, hostOf(target));
      }
    },
    log(e: LogEntry) {
      const day = e.ts.slice(0, 10);
      appendFile(join(opts.logDir, `commands-${day}.jsonl`), JSON.stringify(e) + "\n").catch(
        () => {},
      );
    },
  };
  const bridge = new Bridge(opts.config, io, opts.auth);

  // --- OSC feedback in ------------------------------------------------------------------------
  const feedbackSockets: Socket[] = [];
  for (const t of opts.config.targets) {
    if (!t.feedbackPort) continue;
    const sock = createSocket({ type: "udp4", reuseAddr: true });
    sock.on("message", (buf, from) => {
      try {
        for (const m of messagesOf(decodePacket(new Uint8Array(buf)))) {
          if (opts.debug) say("osc in", from.address, m.address, JSON.stringify(m.args));
          bridge.feedback(t.id, m);
        }
      } catch (e) {
        // Malformed packet from the network: ignore it (log it when debugging).
        if (opts.debug) say("bad packet", from.address, (e as Error).message, buf.toString("hex"));
      }
    });
    sock.on("error", (e) => say(`feedback ${t.id}:${t.feedbackPort}`, e.message));
    await new Promise<void>((ok) => sock.bind(t.feedbackPort, ok));
    feedbackSockets.push(sock);
    say(`feedback from ${t.name ?? t.id} on udp ${t.feedbackPort}`);
  }

  // --- HTTP: health + web pult ----------------------------------------------------------------
  const webRoot = opts.webDir ? resolve(opts.webDir) : undefined;
  const http = createServer((req, res) => {
    serve(req, res).catch(() => {
      res.writeHead(500).end();
    });
  });
  async function serve(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://bridge");
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(
        JSON.stringify({
          ok: true,
          protocol: PROTOCOL_VERSION,
          installation: opts.config.installation,
          targets: bridge.status(),
          devices: bridge.devices.length,
        }),
      );
    }
    if (!webRoot) return res.writeHead(404).end("No web pult configured");
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let file = join(webRoot, rel);
    if (file !== webRoot && !file.startsWith(webRoot + sep)) return res.writeHead(403).end();
    const st = await stat(file).catch(() => null);
    if (!st || st.isDirectory()) file = join(webRoot, "index.html"); // SPA fallback
    const body = await readFile(file).catch(() => null);
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  }

  // --- WebSocket: pults -----------------------------------------------------------------------
  const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on("connection", (ws, req) => {
    const peer: Peer = {
      send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)),
      close: () => ws.close(),
    };
    bridge.connect(peer);
    alive.set(ws, true);
    let greeted = false;
    const helloTimer = setTimeout(
      () => greeted || ws.close(4000, "hello timeout"),
      HELLO_TIMEOUT_MS,
    );
    ws.on("pong", () => alive.set(ws, true));
    ws.on("message", (data) => {
      greeted = true;
      bridge.handle(peer, data.toString());
    });
    ws.on("close", () => {
      clearTimeout(helloTimer);
      bridge.disconnect(peer);
    });
    say(`pult connected from ${req.socket.remoteAddress}`);
  });
  const keepalive = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, KEEPALIVE_MS);
  const ticker = setInterval(() => bridge.tick(), 1000);

  await new Promise<void>((ok) => http.listen(opts.port, opts.host, ok));
  say(`pults on http://${opts.host}:${opts.port}  (socket /ws${webRoot ? ", web pult /" : ""})`);
  for (const t of opts.config.targets) say(`OSC to ${t.name ?? t.id} at ${hostOf(t)}:${t.port}`);

  return {
    bridge,
    port: (http.address() as { port: number }).port,
    async close() {
      clearInterval(keepalive);
      clearInterval(ticker);
      for (const ws of wss.clients) ws.terminate();
      await new Promise((ok) => wss.close(ok));
      await new Promise((ok) => http.close(ok));
      for (const s of feedbackSockets) s.close();
      out.close();
    },
  };
}
