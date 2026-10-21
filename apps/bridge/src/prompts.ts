import { join, resolve } from "node:path";
import { PromptStore as CorePromptStore } from "@osc/bridge-core";
import type { PromptPreset } from "@osc/schema";
import { JsonFile } from "./storage";

export { UNDO_WINDOW_MS, type PromptResult } from "@osc/bridge-core";

/**
 * Prompt presets of the installation, kept in `<dir>/prompts.json` (written atomically). The
 * logic (soft delete, undo window, reorder, duplicate) is the core's, shared with the simulator.
 */
export class PromptStore extends CorePromptStore {
  constructor(dir: string, now: () => number = Date.now) {
    super(new JsonFile<PromptPreset[]>(join(resolve(dir), "prompts.json"), () => []), now);
  }
}
