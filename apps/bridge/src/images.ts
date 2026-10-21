import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { IMAGE_EXT } from "@osc/bridge-core";
import type { ControlOf, ImageAsset, ImageFormat } from "@osc/schema";
import { JsonFile, newId } from "./storage";

export { detectFormat, validateImage, type ImageCheck } from "@osc/bridge-core";
const EXT = IMAGE_EXT;

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
