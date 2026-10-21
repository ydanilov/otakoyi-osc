import { networkInterfaces } from "node:os";
import { pairingUrl, webPultUrl, type Pairing } from "@osc/protocol";
import QRCode from "qrcode";

/** IPv4 addresses of this machine on the local network (phones connect to one of these). */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a!.address);
}

/** True for requests from this machine — the pairing page shows the PIN, so it is local only. */
export function isLoopback(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/**
 * The pairing sheet: one card per network address with two QR codes — the app (deep link) and the
 * web pult (plain URL). Shown on the installation's screen or printed by the studio.
 */
export async function pairingPage(opts: {
  name: string;
  port: number;
  pin?: string | undefined;
  hosts: string[];
  localOnly: boolean;
}): Promise<string> {
  const cards = await Promise.all(
    opts.hosts.map(async (host) => {
      const p: Pairing = { bridge: `ws://${host}:${opts.port}/ws`, pin: opts.pin, name: opts.name };
      const app = pairingUrl(p);
      const web = webPultUrl(p);
      const svg = (s: string) =>
        QRCode.toString(s, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      return `<section class="card">
  <h2>${esc(host)}</h2>
  <div class="qrs">
    <figure>${await svg(app)}<figcaption><b>Otakoyi Control app</b><br>Scan with the phone camera</figcaption></figure>
    <figure>${await svg(web)}<figcaption><b>Web pult</b><br>Any phone or tablet browser</figcaption></figure>
  </div>
  <p class="url">${esc(web)}</p>
</section>`;
    }),
  );
  const warn = opts.localOnly
    ? `<p class="warn">The bridge listens on this computer only (--host 127.0.0.1). Start it with --host 0.0.0.0 so phones on the network can connect.</p>`
    : opts.hosts.length === 0
      ? `<p class="warn">No network connection found. Connect this computer to the installation's Wi-Fi.</p>`
      : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pair a device — ${esc(opts.name)}</title>
<style>
:root{color-scheme:dark;--bg:#0B0B0C;--card:#151517;--border:#2C2C31;--fg:#F4F4F5;--muted:#A1A1AA;--warn:#F59E0B}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,sans-serif;padding:32px 16px}
main{max-width:900px;margin:0 auto}h1{font-size:28px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 24px}
.pin{display:inline-block;font:700 28px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.15em;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin:8px 0 24px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px}
.card h2{font:600 15px/1 "JetBrains Mono",ui-monospace,monospace;color:var(--muted);margin:0 0 16px}
.qrs{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0;flex:1 1 240px;text-align:center}
figure svg{width:100%;max-width:260px;background:#fff;border-radius:12px;padding:8px}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}figcaption b{color:var(--fg)}
.url{font:13px "JetBrains Mono",ui-monospace,monospace;color:var(--muted);word-break:break-all;margin:16px 0 0}
.warn{color:var(--warn)}
@media print{:root{--bg:#fff;--card:#fff;--fg:#000;--muted:#444;--border:#ccc}.card{break-inside:avoid}}
</style></head><body><main>
<h1>${esc(opts.name)}</h1>
<p class="sub">Pair a phone or tablet. It must be on the same network as this computer.</p>
${opts.pin ? `<div>PIN</div><div class="pin">${esc(opts.pin)}</div>` : `<p class="warn">No PIN set (OTAKOYI_PIN): anyone on the network can connect.</p>`}
${warn}
${cards.join("\n")}
</main></body></html>`;
}
