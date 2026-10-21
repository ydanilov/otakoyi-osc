import { PNG } from "pngjs";
import QRCode from "qrcode";

/**
 * Full-frame pairing card for the installation's own output: dark background with the QR on the
 * left (white quiet zone), right part left free for text drawn by the installation (PIN, address,
 * countdown). Same size as the output, so the installation only overlays it — no scaling there.
 */
export function pairingCard(text: string, width = 1280, height = 720): Buffer {
  const w = Math.min(4096, Math.max(320, Math.round(width)));
  const h = Math.min(4096, Math.max(240, Math.round(height)));
  const png = new PNG({ width: w, height: h });
  const bg = [11, 11, 12, 235];
  for (let i = 0; i < w * h; i++) png.data.set(bg, i * 4);

  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 3; // modules of white margin
  const side = Math.floor(Math.min(h * 0.8, w * 0.45));
  const cell = Math.max(1, Math.floor(side / (n + quiet * 2)));
  const box = cell * (n + quiet * 2);
  const x0 = Math.round(w * 0.27 - box / 2);
  const y0 = Math.round((h - box) / 2);
  for (let y = 0; y < box; y++)
    for (let x = 0; x < box; x++) {
      const mx = Math.floor(x / cell) - quiet;
      const my = Math.floor(y / cell) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx) === 1;
      const v = dark ? 0 : 255;
      png.data.set([v, v, v, 255], ((y0 + y) * w + (x0 + x)) * 4);
    }
  return PNG.sync.write(png);
}
