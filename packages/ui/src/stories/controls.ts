import { Control, type ControlOf, type ControlType } from "@osc/schema";

type Input<T extends ControlType> = { type: T; id: string } & Record<string, unknown>;

/**
 * Builds a fully defaulted control for a story through the real zod schema, so stories always see
 * what the app sees after a config is parsed. The grid placement is irrelevant in isolation.
 * If the schema changes shape (e.g. per-form-factor layouts), this is the one place to update.
 */
export function makeControl<T extends ControlType>(input: Input<T>): ControlOf<T> {
  return Control.parse({ grid: { x: 0, y: 0, w: 1, h: 1 }, ...input }) as ControlOf<T>;
}
