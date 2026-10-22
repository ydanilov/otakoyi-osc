import type { ControlOf, PromptPreset } from "@osc/schema";

export type PromptResult<T> =
  { ok: true; value: T } | { ok: false; status: 400 | 404 | 409 | 410; message: string };

type Limits = Pick<ControlOf<"prompt">, "maxLength" | "maxPresets">;

/**
 * Where a JSON document lives. The bridge uses a file written atomically (`JsonFile` in
 * apps/bridge); the simulator keeps it in memory (`memoryDoc`).
 */
export interface Doc<T> {
  read(): Promise<T>;
  write(value: T): Promise<void>;
}

/** A document that only lives in memory (the demo installation, tests). */
export function memoryDoc<T>(initial: T): Doc<T> {
  let value = initial;
  return {
    read: async () => structuredCloneSafe(value),
    write: async (v) => {
      value = structuredCloneSafe(v);
    },
  };
}

const structuredCloneSafe = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Short random id (letters and digits), valid as a schema id. */
export function newId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  return `${prefix}${rand}`;
}

/**
 * How long a deleted preset can be restored (the pult shows Undo for 5 s; the bridge keeps it
 * longer so a slow network never loses an undo). Purged after that.
 */
export const UNDO_WINDOW_MS = 30_000;

/**
 * Prompt presets created by clients for `prompt` controls (ADR-015, ADR-016). Installation state,
 * kept by the bridge (`prompts.json`) and never written into the config. The order of the list is
 * the order on the pult (reorder is persisted). Deletes are soft: restorable for UNDO_WINDOW_MS.
 */
export class PromptStore {
  private items: PromptPreset[] | null = null;

  constructor(
    private file: Doc<PromptPreset[]>,
    private now: () => number = Date.now,
  ) {}

  private async load() {
    if (!this.items) this.items = await this.file.read();
    // Purge deletes that can no longer be undone.
    const t = this.now();
    const kept = this.items.filter(
      (p) => !p.deletedAt || t - Date.parse(p.deletedAt) < UNDO_WINDOW_MS,
    );
    if (kept.length !== this.items.length) {
      this.items = kept;
      await this.file.write(kept);
    }
    return this.items;
  }

  private async save(items: PromptPreset[]) {
    this.items = items;
    await this.file.write(items);
  }

  /** Live presets of a control, in pult order. */
  async list(pultId: string, controlId: string): Promise<PromptPreset[]> {
    return (await this.load()).filter(
      (p) => p.pultId === pultId && p.controlId === controlId && !p.deletedAt,
    );
  }

  /** A preset, including a soft-deleted one. */
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
    await this.save([...(await this.load()), preset]);
    return { ok: true, value: preset };
  }

  async update(
    id: string,
    limits: Limits,
    patch: { label?: unknown; text?: unknown; on?: unknown },
  ): Promise<PromptResult<PromptPreset>> {
    const items = await this.load();
    const cur = items.find((p) => p.id === id && !p.deletedAt);
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
    await this.save(items.map((p) => (p.id === id ? next : p)));
    return { ok: true, value: next };
  }

  /** Copy a preset right after the original ("Duplicate" in the card's actions). */
  async duplicate(id: string, limits: Limits): Promise<PromptResult<PromptPreset>> {
    const items = await this.load();
    const cur = items.find((p) => p.id === id && !p.deletedAt);
    if (!cur) return { ok: false, status: 404, message: "No such preset" };
    if ((await this.list(cur.pultId, cur.controlId)).length >= limits.maxPresets)
      return { ok: false, status: 409, message: `At most ${limits.maxPresets} presets` };
    const at = new Date(this.now()).toISOString();
    const copy: PromptPreset = {
      ...cur,
      id: newId("p"),
      label: `${cur.label} copy`.slice(0, 64),
      createdAt: at,
      updatedAt: at,
    };
    const i = items.indexOf(cur);
    await this.save([...items.slice(0, i + 1), copy, ...items.slice(i + 1)]);
    return { ok: true, value: copy };
  }

  /** Soft delete. Returns the deleted preset (restorable until the undo window ends). */
  async remove(id: string): Promise<PromptPreset | null> {
    const items = await this.load();
    const cur = items.find((p) => p.id === id && !p.deletedAt);
    if (!cur) return null;
    const gone = { ...cur, deletedAt: new Date(this.now()).toISOString() };
    await this.save(items.map((p) => (p.id === id ? gone : p)));
    return gone;
  }

  /** Undo a delete within the window; the preset returns to its place in the list. */
  async restore(id: string, limits: Limits): Promise<PromptResult<PromptPreset>> {
    const items = await this.load();
    const cur = items.find((p) => p.id === id);
    if (!cur) return { ok: false, status: 410, message: "Too late to undo" };
    if (!cur.deletedAt) return { ok: true, value: cur };
    if ((await this.list(cur.pultId, cur.controlId)).length >= limits.maxPresets)
      return { ok: false, status: 409, message: `At most ${limits.maxPresets} presets` };
    const { deletedAt: _, ...back } = cur;
    await this.save(items.map((p) => (p.id === id ? back : p)));
    return { ok: true, value: back };
  }

  /**
   * New order for a control's presets. `ids` must be exactly its live presets; everything else in
   * the file keeps its position.
   */
  async reorder(
    pultId: string,
    controlId: string,
    ids: unknown,
  ): Promise<PromptResult<PromptPreset[]>> {
    const items = await this.load();
    const mine = items.filter(
      (p) => p.pultId === pultId && p.controlId === controlId && !p.deletedAt,
    );
    if (
      !Array.isArray(ids) ||
      ids.length !== mine.length ||
      new Set(ids).size !== ids.length ||
      !mine.every((p) => ids.includes(p.id))
    )
      return { ok: false, status: 400, message: "ids must list every preset of the control once" };
    const queue = (ids as string[]).map((id) => mine.find((p) => p.id === id)!);
    // Slots that held this control's presets get them in the new order.
    const next = items.map((p) => (mine.includes(p) ? queue.shift()! : p));
    await this.save(next);
    return { ok: true, value: next.filter((p) => mine.includes(p)) };
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
