import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * A JSON document on disk, written atomically (temp file + rename) so a crash or power cut never
 * leaves half a file. Installation state the bridge keeps across restarts (image library, prompt
 * presets, later value snapshots) uses this.
 */
export class JsonFile<T> {
  private writing: Promise<void> = Promise.resolve();

  constructor(
    readonly path: string,
    private fallback: () => T,
  ) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as T;
    } catch {
      return this.fallback();
    }
  }

  /** Writes are serialised so two quick updates never interleave. */
  write(value: T): Promise<void> {
    const next = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(value, null, 2));
      await rename(tmp, this.path);
    });
    this.writing = next.catch(() => {});
    return next;
  }
}

export { newId } from "@osc/bridge-core";
