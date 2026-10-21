import type { ControlOf, ImageFormat } from "@osc/schema";

/** Detect an image format from its first bytes. The file name and Content-Type are not trusted. */
export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  const b = (i: number) => bytes[i] ?? -1;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "jpeg";
  if (b(0) === 0x89 && ascii(1, 4) === "PNG" && b(4) === 0x0d && b(5) === 0x0a) return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(0, 4) === "GIF8") return "gif";
  if (ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "mif1", "msf1"].includes(ascii(8, 12)))
    return "heic";
  return null;
}

/** File extension per format. */
export const IMAGE_EXT: Record<ImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  heic: "heic",
  gif: "gif",
};

export type ImageCheck =
  { ok: true; format: ImageFormat } | { ok: false; status: 413 | 415 | 400; message: string };

/** Validate an upload against the image control's config (format by content, size by maxMB). */
export function validateImage(
  c: Pick<ControlOf<"image">, "formats" | "maxMB">,
  bytes: Uint8Array,
): ImageCheck {
  if (!bytes.length) return { ok: false, status: 400, message: "Empty upload" };
  if (bytes.length > c.maxMB * 1024 * 1024)
    return { ok: false, status: 413, message: `Image is larger than ${c.maxMB} MB` };
  const format = detectFormat(bytes);
  if (!format) return { ok: false, status: 415, message: "Not an image this bridge understands" };
  if (!c.formats.includes(format))
    return {
      ok: false,
      status: 415,
      message: `${format} is not accepted here (${c.formats.join(", ")})`,
    };
  return { ok: true, format };
}
