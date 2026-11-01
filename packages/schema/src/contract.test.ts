import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ContractParameter,
  OscContractSchema,
  PARAMETER_PRIORITIES,
  PARAMETER_TYPES,
  parseContract,
  priorityOf,
  hasSystemGroup,
} from "./contract";

const docs = (p: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../docs/${p}`, import.meta.url)), "utf8"));
const jsonSchema = docs("osc-contract.schema.json");
const example = docs("examples/osc-contract.example.json");
const paramSchema = jsonSchema.properties.parameters.items;

describe("OSC contract", () => {
  it("the example parses", () => {
    const r = parseContract(example);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("a 1.0 contract without the new fields is still valid", () => {
    const v1 = {
      ...example,
      contractVersion: 1,
      parameters: example.parameters.map(
        ({ priority: _p, formFactors: _f, ...rest }: Record<string, unknown>) => rest,
      ),
    };
    expect(parseContract(v1).ok).toBe(true);
  });

  it("rejects reserved addresses, unknown fields and bad priorities", () => {
    const bad = (p: object) =>
      parseContract({ ...example, parameters: [{ ...example.parameters[0], ...p }] });
    expect(bad({ address: "/sys/fps" }).ok).toBe(false);
    expect(bad({ priority: "urgent" }).ok).toBe(false);
    expect(bad({ colour: "red" }).ok).toBe(false);
    expect(bad({ formFactors: ["phone", "phone"] }).ok).toBe(false);
  });

  it("untagged parameters count as tune", () => {
    expect(priorityOf({})).toBe("tune");
    expect(priorityOf({ priority: "live" })).toBe("live");
  });

  it("stays in sync with docs/osc-contract.schema.json", () => {
    expect(Object.keys(ContractParameter.shape).sort()).toEqual(
      Object.keys(paramSchema.properties).sort(),
    );
    expect(Object.keys(OscContractSchema.shape).sort()).toEqual(
      Object.keys(jsonSchema.properties).sort(),
    );
    expect(paramSchema.properties.priority.enum).toEqual([...PARAMETER_PRIORITIES]);
    expect(paramSchema.properties.type.enum).toEqual([...PARAMETER_TYPES]);
    expect(jsonSchema.properties.contractVersion.enum).toEqual([1, 1.1]);
    expect(paramSchema.required.sort()).toEqual(["address", "label", "type"]);
  });
});

describe("System group (ADR-018)", () => {
  const sys = [
    { address: "/system/resw", type: "int", label: "Screen Width px", group: "System" },
    { address: "/system/resh", type: "int", label: "Screen Height px", group: "System" },
    { address: "/system/debug", type: "bool", label: "Debug", group: "System" },
    { address: "/system/seed", type: "int", label: "Seed", group: "System" },
  ];
  const project = example.parameters.filter((p: { group?: string }) => p.group !== "System");
  const withParams = (parameters: object[]) =>
    parseContract({ ...example, parameters: [...project, ...parameters] });

  it("accepts exactly the four standard parameters", () => {
    const r = withParams(sys);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(hasSystemGroup(r.contract)).toBe(true);
  });

  it("rejects extra, missing, mistyped or misplaced system parameters", () => {
    const errs = (ps: object[]) => {
      const r = withParams(ps);
      return r.ok ? [] : r.errors;
    };
    expect(
      errs([...sys, { address: "/system/fps", type: "int", label: "x", group: "System" }]),
    ).toHaveLength(1);
    expect(errs(sys.slice(0, 3))).toEqual(["System group: /system/seed (Seed) is missing"]);
    expect(errs([...sys.slice(0, 3), { ...sys[3], type: "float" }])).toHaveLength(1);
    expect(errs([{ address: "/system/resw", type: "int", label: "W", group: "Look" }])[0]).toMatch(
      /reserved/,
    );
  });
});
