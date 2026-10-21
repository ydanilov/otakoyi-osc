import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { PROTOCOL_VERSION } from "@osc/protocol";
import type { InstallationConfig } from "@osc/schema";
import { Bonjour } from "bonjour-service";
import { WebSocketServer, type WebSocket } from "ws";
import { createApi } from "./api";
import { Bridge, type BridgeAuth, type BridgeIO, type LogEntry, type Peer } from "./bridge";
import type { Browse } from "./resolver";
import type { Supervisor } from "./supervisor";
import { bonjourBrowse, openTargets } from "./targets";
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
  /**
   * Installation state kept across restarts (image uploads and library, prompt presets), in
   * `<dataDir>/<installation id>/`. Default: next to the log directory.
   */
  dataDir?: string | undefined;
  auth: BridgeAuth;
  quiet?: boolean;
  /** Log every OSC packet in and out (OTAKOYI_DEBUG=1). */
  debug?: boolean;
  /**
   * Advertise the bridge on the local network (mDNS `_otakoyi._tcp`). Default: when not local-only.
   * `false` also turns off discovery of `host: "auto"` targets (unless `browse` is given).
   */
  mdns?: boolean;
  /** Starts and watches the installation software (ADR-011). Default: none. */
  supervisor?: Supervisor | undefined;
  /** mDNS browse for `host: "auto"` targets; null disables discovery. Default: bonjour. */
  browse?: Browse | null;
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

export async function startServer(opts: ServerOptions) {
  const say = (...a: unknown[]) => opts.quiet || console.log("[bridge]", ...a);
  await mkdir(opts.logDir, { recursive: true });

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

  // --- OSC to and from the installation (UDP / TCP, auto hosts) ------------------------------
  const needsBrowse = opts.config.targets.some((t) => t.host === "auto");
  let browser: Bonjour | null = null;
  const browse =
    opts.browse !== undefined
      ? opts.browse
      : needsBrowse && opts.mdns !== false
        ? bonjourBrowse((browser = new Bonjour()))
        : null;
  let feedbackTo: Bridge | null = null;
  const transports = await openTargets({
    targets: opts.config.targets,
    onFeedback: (id, m) => feedbackTo?.feedback(id, m),
    browse,
    say,
    debug: opts.debug,
  });

  const io: BridgeIO = {
    pairingLinks: links,
    now: () => Date.now(),
    supervisor: opts.supervisor,
    sendOsc: (target, messages) => transports.send(target, messages),
    targetOffline: (target) => void transports.offline(target),
    log(e: LogEntry) {
      const day = e.ts.slice(0, 10);
      appendFile(join(opts.logDir, `commands-${day}.jsonl`), JSON.stringify(e) + "\n").catch(
        () => {},
      );
    },
  };
  const bridge = new Bridge(opts.config, io, opts.auth);
  feedbackTo = bridge;
  const dataDir = join(
    resolve(opts.dataDir ?? join(opts.logDir, "..", "data")),
    opts.config.installation.id,
  );
  const api = createApi(bridge, dataDir);

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
          // Per target: online, last feedback (epoch ms and ISO), where it is reached.
          targets: bridge.status().map((t) => ({
            ...t,
            lastSeen: t.lastFeedbackAt === null ? null : new Date(t.lastFeedbackAt).toISOString(),
            ...transports.describe(t.id),
          })),
          modes: bridge.modes,
          devices: bridge.devices.length,
        }),
      );
    }
    if (url.pathname.startsWith("/api/") && (await api.handle(req, res, url))) return;
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
  for (const t of opts.config.targets) {
    const r = transports.resolver.current(t);
    say(
      `OSC to ${t.name ?? t.id} at ${t.protocol} ${r.host}:${r.port}${t.host === "auto" ? " (auto)" : ""}`,
    );
  }

  return {
    bridge,
    api,
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
      transports.close();
      browser?.destroy();
    },
  };
}
