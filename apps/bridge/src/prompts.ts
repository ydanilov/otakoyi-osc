import { join, resolve } from "node:path";
import type { ControlOf, PromptPreset } from "@osc/schema";
import { JsonFile, newId } from "./storage";

export type PromptResult<T> =
  { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; message: string };

type Limits = Pick<ControlOf<"prompt">, "maxLength" | "maxPresets">;

/**
 * Prompt presets created by clients for `prompt` controls (ADR-015). Installation state, kept by the
 * bridge in `<dir>/prompts.json` and never written into the config.
 */
export class PromptStore {
  private file: JsonFile<PromptPreset[]>;
  private items: PromptPreset[] | null = null;

  constructor(
    dir: string,
    private now: () => number = Date.now,
  ) {
    this.file = new JsonFile(join(resolve(dir), "prompts.json"), () => []);
  }

  private async load() {
    if (!this.items) this.items = await this.file.read();
    return this.items;
  }

  async list(pultId: string, controlId: string): Promise<PromptPreset[]> {
    return (await this.load()).filter((p) => p.pultId === pultId && p.controlId === controlId);
  }

  async get(id: string) {
    return (await this.load()).find((p) => p.id === id);
  }

  async create(
    pultId: string,
    controlId: string,
    limits: Limits,
    input: { label?: unknown; text?: unknown; on?: unknown },
  ): Promise<PromptResult<PromptPreset>> {
    const bad = check(input, limits, true);
    if (bad) return bad;
    if ((await this.list(pultId, controlId)).length >= limits.maxPresets)
      return { ok: false, status: 409, message: `At most ${limits.maxPresets} presets` };
    const at = new Date(this.now()).toISOString();
    const preset: PromptPreset = {
      id: newId("p"),
      pultId,
      controlId,
      label: (input.label as string).trim(),
      text: input.text as string,
      on: input.on === undefined ? true : (input.on as boolean),
      createdAt: at,
      updatedAt: at,
    };
    this.items = [...(await this.load()), preset];
    await this.file.write(this.items);
    return { ok: true, value: preset };
  }

  async update(
    id: string,
    limits: Limits,
    patch: { label?: unknown; text?: unknown; on?: unknown },
  ): Promise<PromptResult<PromptPreset>> {
    const items = await this.load();
    const cur = items.find((p) => p.id === id);
    if (!cur) return { ok: false, status: 404, message: "No such preset" };
    const bad = check(patch, limits, false);
    if (bad) return bad;
    const next: PromptPreset = {
      ...cur,
      ...(patch.label !== undefined ? { label: (patch.label as string).trim() } : {}),
      ...(patch.text !== undefined ? { text: patch.text as string } : {}),
      ...(patch.on !== undefined ? { on: patch.on as boolean } : {}),
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.items = items.map((p) => (p.id === id ? next : p));
    await this.file.write(this.items);
    return { ok: true, value: next };
  }

  async remove(id: string): Promise<boolean> {
    const items = await this.load();
    if (!items.some((p) => p.id === id)) return false;
    this.items = items.filter((p) => p.id !== id);
    await this.file.write(this.items);
    return true;
  }
}

function check(
  input: { label?: unknown; text?: unknown; on?: unknown },
  limits: Limits,
  required: boolean,
): { ok: false; status: 400; message: string } | null {
  const fail = (message: string) => ({ ok: false as const, status: 400 as const, message });
  if (required || input.label !== undefined) {
    if (typeof input.label !== "string" || !input.label.trim() || input.label.length > 64)
      return fail("label: 1–64 characters");
  }
  if (required || input.text !== undefined) {
    if (typeof input.text !== "string") return fail("text must be a string");
    if (input.text.length > limits.maxLength)
      return fail(`text is longer than ${limits.maxLength} characters`);
  }
  if (input.on !== undefined && typeof input.on !== "boolean") return fail("on must be a boolean");
  return null;
}
