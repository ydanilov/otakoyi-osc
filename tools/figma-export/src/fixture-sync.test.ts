import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8"));

// The design system's stories render the template pult from their own copy of the exported config
// (`@osc/ui` builds without the exporter, ADR-020). Re-export → `pnpm fixtures:sync`, in the same
// PR. Compared as JSON: the copy is formatted with Prettier.
describe("template fixture", () => {
  it("matches the copy in the design system's stories", () => {
    expect(
      read("../../../design-system/packages/ui/src/stories/fixtures/template.config.json"),
      "Run `pnpm fixtures:sync` and commit the new fixture",
    ).toEqual(read("../fixtures/template.config.json"));
  });
});
