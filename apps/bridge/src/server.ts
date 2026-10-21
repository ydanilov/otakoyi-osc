import { createSocket, type Socket } from "node:dgram";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { decodePacket, encodeMessage, messagesOf } from "@osc/core";
import { PROTOCOL_VERSION } from "@osc/protocol";
import type { InstallationConfig, Target } from "@osc/schema";
import { Bonjour } from "bonjour-service";
import { WebSocketServer, type WebSocket } from "ws";
import { Bridge, type BridgeAuth, type LogEntry, type Peer } from "./bridge";
import { pairingUrl, webPultUrl } from "@osc/protocol";
import QRCode from "qrcode";
import { pairingCard } from "./pairing-card";
import { isLoopback, lanAddresses, pairingPage } from "./pairing-page";

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
  /** Advertise the bridge on the local network (mDNS `_otakoyi._tcp`). Default: when not local-only. */
  mdns?: boolean;
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
  let boundPort = opts.port;
  const localOnly = opts.host === "127.0.0.1" || opts.host === "localhost";
  /** What a phone scans: the first LAN address of this machine (or localhost when local-only). */
  const links = () => {
    const host = (localOnly ? undefined : lanAddresses()[0]) ?? "127.0.0.1";
    const p = {
      bridge: `ws://${host}:${boundPort}/ws`,
      pin: opts.auth.clientPin,
      name: opts.config.installation.name,
    };
    return { app: pairingUrl(p), web: webPultUrl(p), pin: opts.auth.clientPin ?? "" };
  };
  const io = {
    pairingLinks: links,
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
    if (url.pathname === "/pair.png") {
      // Images for the installation's own pairing overlay (TouchDesigner loads them from localhost).
      // ?card=1&w=1280&h=720 → full-frame card with the QR on the left; otherwise a bare QR.
      if (!isLoopback(req.socket.remoteAddress)) return res.writeHead(403).end();
      const l = links();
      const content = url.searchParams.get("kind") === "web" ? l.web : l.app;
      const png = url.searchParams.has("card")
        ? pairingCard(
            content,
            Number(url.searchParams.get("w")) || 1280,
            Number(url.searchParams.get("h")) || 720,
          )
        : await QRCode.toBuffer(content, {
            type: "png",
            width: Math.min(2048, Math.max(128, Number(url.searchParams.get("size")) || 720)),
            margin: 2,
            errorCorrectionLevel: "M",
          });
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      return res.end(png);
    }
    if (url.pathname === "/pair") {
      // Shows the PIN, so only on the installation's own screen.
      if (!isLoopback(req.socket.remoteAddress))
        return res.writeHead(403).end("Open /pair on the installation computer");
      const html = await pairingPage({
        name: opts.config.installation.name,
        port: (http.address() as { port: number }).port,
        pin: opts.auth.clientPin,
        hosts: localOnly ? ["127.0.0.1"] : lanAddresses(),
        localOnly,
      });
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      return res.end(html);
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
  const port = (http.address() as { port: number }).port;
  boundPort = port;
  say(`pults on http://${opts.host}:${port}  (socket /ws${webRoot ? ", web pult /" : ""})`);
  say(`pair a device: open http://127.0.0.1:${port}/pair on this computer`);

  // --- mDNS: lets the app find the bridge without typing an address --------------------------
  let bonjour: Bonjour | null = null;
  if (opts.mdns ?? !localOnly) {
    bonjour = new Bonjour();
    bonjour.publish({
      name: `${opts.config.installation.name} (${opts.config.installation.id})`,
      type: "otakoyi",
      port,
      txt: { id: opts.config.installation.id, protocol: String(PROTOCOL_VERSION), path: "/ws" },
    });
    say(`advertised as _otakoyi._tcp on the local network`);
  }
  for (const t of opts.config.targets) say(`OSC to ${t.name ?? t.id} at ${hostOf(t)}:${t.port}`);

  return {
    bridge,
    port,
    async close() {
      if (bonjour)
        await new Promise<void>((ok) =>
          bonjour!.unpublishAll(() => {
            bonjour!.destroy();
            ok();
          }),
        );
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
