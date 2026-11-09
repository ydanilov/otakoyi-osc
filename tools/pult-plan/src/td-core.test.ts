import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseContract } from "@osc/contract";
import { draftConfig, planContract, validateDraft } from "./plan";

// The TouchDesigner contract generator's core is pure Python (tools/touchdesigner/
// otakoyi_contract_core.py). Its fixture contract must pass this repo's contract parser and draft.
const script = fileURLToPath(
  new URL("../../touchdesigner/test_otakoyi_contract_core.py", import.meta.url),
);
const py = spawnSync("python3", [script, "--fixture"], {
  encoding: "utf8",
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
});
const hasPython = py.status === 0;

describe.skipIf(!hasPython)("TouchDesigner contract generator (Python core)", () => {
  it("writes a contract the repo accepts, with the System group", () => {
    const r = parseContract(JSON.parse(py.stdout));
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.contract.parameters.filter((p) => p.group === "System")).toHaveLength(4);
    const d = draftConfig(r.contract);
    expect(validateDraft(d.config)).toEqual([]);
    expect(d.config.system).toEqual({});
    expect(d.plan.form).toBe("tablet"); // useCase live
  });

  it("the real Custom Parameters of The Whale give a valid contract whose live set fits a tablet", () => {
    const out = spawnSync("python3", [script, "--whale"], {
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    const r = parseContract(JSON.parse(out.stdout));
    if (!r.ok) throw new Error(r.errors.join("\n"));
    const c = r.contract;
    expect(c.parameters.filter((p) => p.group === "System").map((p) => p.address)).toEqual([
      "/system/resw",
      "/system/resh",
      "/system/debug",
      "/system/seed",
    ]);
    expect(c.actions).toEqual(["flash", "blackout", "restart"]);
    expect(c.parameters.some((p) => p.address === "/market/restart")).toBe(false);
    const tablet = planContract(c, "tablet");
    expect(tablet.issues.map((i) => i.code)).not.toContain("live-overflow");
    expect(tablet.main[0]!.priority).toBe("live");
    expect(validateDraft(draftConfig(c).config)).toEqual([]);
  });

  it("passes its own Python unit tests", () => {
    const t = spawnSync("python3", [script], {
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    expect(t.status, t.stderr).toBe(0);
  });
});
