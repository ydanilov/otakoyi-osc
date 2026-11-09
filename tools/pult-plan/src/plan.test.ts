import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseConfig, systemPult } from "@osc/schema";
import { parseContract, type ContractParameter, type OscContractDoc } from "@osc/contract";
import { controlFor, controlId, type MapIssue } from "./controls";
import { draftConfig, fitsOneScreen, placeAll, planContract, validateDraft } from "./plan";

const raw = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../docs/examples/osc-contract.example.json", import.meta.url)),
    "utf8",
  ),
);
const parsed = parseContract(raw);
if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
const example = parsed.contract;

const contract = (parameters: ContractParameter[], useCase?: "lobby" | "live"): OscContractDoc => ({
  contractVersion: 1.1,
  installation: { id: "t", name: "Test", ...(useCase ? { useCase } : {}) },
  osc: { in: { port: 7000 }, feedback: { port: 9000 } },
  parameters,
});
const fader = (group: string, i: number, priority: ContractParameter["priority"] = "tune") =>
  ({
    address: `/${group.toLowerCase()}/p${i}`,
    type: "float",
    label: `${group} ${i}`,
    group,
    priority,
  }) as ContractParameter;

const map = (p: Partial<ContractParameter>) => {
  const issues: MapIssue[] = [];
  const d = controlFor({ address: "/a/b", label: "A", type: "float", ...p }, "a-b", issues);
  return { type: d.control.type, shape: d.shape, control: d.control, issues };
};

describe("controlFor", () => {
  it("maps by type, honouring hints and dangerous", () => {
    expect(map({ type: "float" }).type).toBe("fader");
    expect(map({ type: "float", hint: "knob" }).type).toBe("knob");
    expect(map({ type: "int", min: 0, max: 8 }).control).toMatchObject({ int: true, step: 1 });
    expect(map({ type: "bool", priority: "live" }).control).toMatchObject({ style: "button" });
    expect(map({ type: "bool" }).control).toMatchObject({ style: "switch" });
    expect(map({ type: "trigger" }).type).toBe("button");
    expect(map({ type: "trigger", dangerous: true }).type).toBe("holdToConfirm");
    expect(map({ type: "trigger", address: "/cue/{index}", count: 12 }).control).toMatchObject({
      type: "buttonGrid",
      rows: 3,
      cols: 4,
    });
    const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i, label: `O${i}` }));
    expect(map({ type: "enum", options: opts(3) }).type).toBe("segmented");
    expect(map({ type: "enum", options: opts(6) }).type).toBe("sceneList");
    expect(map({ type: "enum", options: opts(3), hint: "sceneList" }).type).toBe("sceneList");
    expect(map({ type: "color" }).type).toBe("colorPicker");
    expect(map({ type: "xy" }).type).toBe("xy");
    expect(map({ type: "float", dangerous: true }).control).toMatchObject({ lock: true });
  });

  it("makes config-safe ids", () => {
    expect(controlId("/wall/intensity")).toBe("wall-intensity");
    expect(controlId("/cue/{index}")).toBe("cue");
    expect(controlId("/Pump Speed")).toBe("pump-speed");
  });
});

describe("planContract", () => {
  it("puts live first, keeps groups whole and splits only a group bigger than a screen", () => {
    // Phone: 5 horizontal faders fit one screen (docs/pult-capacity.md).
    const c = contract([
      ...[1, 2, 3].map((i) => fader("A", i)),
      ...[1, 2, 3].map((i) => fader("B", i)),
      ...Array.from({ length: 12 }, (_, i) => fader("Big", i)),
      fader("Show", 1, "live"),
    ]);
    const plan = planContract(c, "phone");
    expect(plan.main.map((p) => p.title)).toEqual([
      "Show",
      "A",
      "B",
      "Big 1/3",
      "Big 2/3",
      "Big 3/3",
    ]);
    expect(plan.main[0]!.priority).toBe("live");
    for (const p of plan.main)
      expect(
        fitsOneScreen(
          p.controls.map((d) => ({
            id: d.control.id as string,
            shape: d.shape,
            group: d.group,
            control: d.control,
          })),
          "phone",
        ),
      ).toBe(true);
  });

  it("drops hidden, sends setup to its own pult and orders by `order`", () => {
    const c = contract([
      { ...fader("A", 1), order: 2 },
      { ...fader("A", 2), order: 1 },
      { ...fader("A", 3), priority: "hidden" },
      { ...fader("S", 1), priority: "setup" },
    ]);
    const plan = planContract(c, "phone");
    expect(plan.main[0]!.controls.map((d) => d.param.address)).toEqual(["/a/p2", "/a/p1"]);
    expect(plan.setup.map((p) => p.title)).toEqual(["S"]);
    const all = [...plan.main, ...plan.setup].flatMap((p) =>
      p.controls.map((d) => d.param.address),
    );
    expect(all).not.toContain("/a/p3");
  });

  it("warns when live does not fit one phone screen", () => {
    const c = contract(Array.from({ length: 8 }, (_, i) => fader(`G${i}`, 1, "live")));
    expect(planContract(c, "phone").issues.map((i) => i.code)).toContain("live-overflow");
    expect(planContract(c, "tablet").issues.map((i) => i.code)).not.toContain("live-overflow");
  });
});

describe("draftConfig", () => {
  it("the example contract becomes a valid config with both layouts", () => {
    const d = draftConfig(example);
    expect(validateDraft(d.config)).toEqual([]);
    const pults = d.config.pults as Array<{ id: string; pages: Array<{ controls: unknown[] }> }>;
    const placed = pults.flatMap((p) => p.pages.flatMap((g) => g.controls)).length;
    expect(placed).toBe(
      example.parameters.filter((p) => p.priority !== "hidden" && p.group !== "System").length,
    );
    expect(d.config.system).toEqual({}); // the System group → the standard System screen
    expect(d.plan.form).toBe("phone"); // useCase lobby
    expect(d.screens.every((s) => s.phone === 1)).toBe(true);
  });

  it("never lays out the System group on a project screen", () => {
    const d = draftConfig(example);
    const all = (
      d.config.pults as Array<{ pages: Array<{ controls: Array<{ address?: string }> }> }>
    ).flatMap((p) => p.pages.flatMap((g) => g.controls.map((c) => c.address ?? "")));
    expect(all.some((a) => a.startsWith("/system/"))).toBe(false);
    const r = parseConfig(d.config);
    if (!r.ok) throw new Error("draft");
    expect(systemPult(r.config)!.pages[0]!.controls).toHaveLength(4);
  });

  it("a live use case is cut for the tablet and gets a Setup pult", () => {
    const c = contract([fader("A", 1, "live"), { ...fader("S", 1), priority: "setup" }], "live");
    const d = draftConfig(c);
    expect(d.plan.form).toBe("tablet");
    expect(validateDraft(d.config)).toEqual([]);
    expect((d.config.pults as Array<{ id: string }>).map((p) => p.id)).toEqual(["main", "setup"]);
  });
});

describe("placeAll", () => {
  it("starts each group on a new phone row and packs tablet rows", () => {
    const items = [
      { id: "a", shape: "half" as const, group: "A" },
      { id: "b", shape: "half" as const, group: "B" },
    ];
    expect(placeAll(items, "phone").get("b")).toEqual({ x: 0, y: 2, w: 6, h: 2 });
    expect(placeAll(items, "tablet").get("b")).toEqual({ x: 2, y: 0, w: 2, h: 2 });
  });
});
