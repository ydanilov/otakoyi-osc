import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM build script without types
import { buildPlugin } from "../build.mjs";

describe("Otakoyi Inspector build", () => {
  it("bundles code.ts into one self-contained script", async () => {
    const r = (await buildPlugin({ write: false })) as {
      errors: unknown[];
      code: string;
    };
    expect(r.errors).toEqual([]);
    const js = r.code;
    expect(js).not.toMatch(/^\s*import\s/m);
    expect(js).not.toMatch(/\brequire\(/);
    expect(js).toContain("figma.showUI");
    expect(js.length).toBeLessThan(1_000_000);
    // Figma's sandbox rejects BigInt literals and newer syntax at parse time.
    expect(js).not.toMatch(/(^|[^\w$."'`])-?\d+n(?![\w$])/);
    expect(() => new Function(js)).not.toThrow();
  });
});
