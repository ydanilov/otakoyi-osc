import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ControlOf, ImageAsset, ImageFormat } from "@osc/schema";
import { JsonFile, newId } from "./storage";

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

const EXT: Record<ImageFormat, string> = {
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

/**
 * The installation's image library: uploaded files in `<dir>/uploads`, the list in
 * `<dir>/images.json`. Paths handed to the installation are absolute.
 */
export class ImageLibrary {
  private file: JsonFile<ImageAsset[]>;
  private items: ImageAsset[] | null = null;
  readonly uploads: string;

  constructor(
    dir: string,
    private now: () => number = Date.now,
  ) {
    this.uploads = resolve(dir, "uploads");
    this.file = new JsonFile(join(resolve(dir), "images.json"), () => []);
  }

  private async load(): Promise<ImageAsset[]> {
    if (!this.items) this.items = await this.file.read();
    return this.items;
  }

  async list(filter: { pultId?: string; controlId?: string } = {}): Promise<ImageAsset[]> {
    return (await this.load()).filter(
      (a) =>
        (!filter.pultId || a.pultId === filter.pultId) &&
        (!filter.controlId || a.controlId === filter.controlId),
    );
  }

  async get(id: string): Promise<ImageAsset | undefined> {
    return (await this.load()).find((a) => a.id === id);
  }

  /** Store a validated upload. With `keep: false` (control without a library) older uploads of the same control are removed. */
  async add(
    input: {
      pultId: string;
      controlId: string;
      name: string;
      format: ImageFormat;
      bytes: Uint8Array;
    },
    keep = true,
  ): Promise<ImageAsset> {
    const items = await this.load();
    const id = newId("img");
    await mkdir(this.uploads, { recursive: true });
    const path = join(this.uploads, `${id}.${EXT[input.format]}`);
    await writeFile(path, input.bytes);
    const asset: ImageAsset = {
      id,
      pultId: input.pultId,
      controlId: input.controlId,
      name: sanitizeName(input.name) || `${id}.${EXT[input.format]}`,
      format: input.format,
      bytes: input.bytes.length,
      path,
      createdAt: new Date(this.now()).toISOString(),
    };
    if (!keep)
      for (const old of items.filter(
        (a) => a.pultId === input.pultId && a.controlId === input.controlId,
      ))
        await this.remove(old.id);
    this.items = [...(await this.load()), asset];
    await this.file.write(this.items);
    return asset;
  }

  async remove(id: string): Promise<boolean> {
    const items = await this.load();
    const asset = items.find((a) => a.id === id);
    if (!asset) return false;
    this.items = items.filter((a) => a.id !== id);
    await this.file.write(this.items);
    await unlink(asset.path).catch(() => {});
    return true;
  }
}

const sanitizeName = (n: string) =>
  n
    .replace(/[\\/]/g, "_")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "")
    .slice(0, 120)
    .trim();
