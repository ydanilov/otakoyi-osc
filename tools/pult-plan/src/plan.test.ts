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
  it("makes one tab per TD page, in TD order, never merging or splitting pages", () => {
    // Phone: 5 horizontal faders fit one screen (docs/pult-capacity.md).
    const c = contract([
      fader("Show", 1, "live"),
      ...[1, 2].map((i) => fader("A", i)),
      ...[1, 2].map((i) => fader("B", i)),
      ...Array.from({ length: 12 }, (_, i) => fader("Big", i)),
    ]);
    const plan = planContract(c, "phone");
    // A and B would fit one screen together, but grouping is decided in TouchDesigner.
    expect(plan.main.map((p) => p.title)).toEqual(["Show", "A", "B", "Big"]);
    expect(plan.main.map((p) => p.screens)).toEqual([1, 1, 1, 3]);
    expect(plan.main[0]!.priority).toBe("live");
  });

  it("puts live before tune inside a tab, so the first screen runs the show", () => {
    const c = contract([
      fader("Look", 1),
      fader("Look", 2, "live"),
      fader("Look", 3),
      fader("Look", 4, "live"),
    ]);
    const [tab] = planContract(c, "phone").main;
    expect(tab!.priority).toBe("live");
    expect(tab!.controls.map((d) => d.param.address)).toEqual([
      "/look/p2",
      "/look/p4",
      "/look/p1",
      "/look/p3",
    ]);
  });

  it("names the TD fix when live is scattered, not first, or too big", () => {
    const codes = (ps: ContractParameter[], ff: "phone" | "tablet" = "phone") =>
      planContract(contract(ps), ff).issues.map((i) => i.code);
    expect(codes([fader("A", 1), fader("B", 1, "live")])).toContain("live-not-first");
    const scattered = codes([fader("A", 1, "live"), fader("B", 1, "live")]);
    expect(scattered).toContain("live-scattered");
    expect(scattered).not.toContain("live-not-first");
    const big = Array.from({ length: 8 }, (_, i) => fader("Show", i, "live"));
    expect(codes(big)).toContain("live-overflow");
    expect(codes(big, "tablet")).not.toContain("live-overflow");
    expect(codes([fader("A", 1, "live"), ...[1, 2, 3].map((i) => fader("B", i))])).toEqual([
      "small-tab",
    ]);
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
    // One draft tab per TD page, in TD order (then the other form factor's tab).
    const mainTabs = d.screens.filter((s) => s.pult === "main").map((s) => s.page);
    expect(mainTabs.slice(0, d.plan.main.length)).toEqual(d.plan.main.map((p) => p.id));
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

  it("a live use case is cut for the tablet and puts [setup] in Installation › Setup", () => {
    const c = contract([fader("A", 1, "live"), { ...fader("S", 1), priority: "setup" }], "live");
    const d = draftConfig(c);
    expect(d.plan.form).toBe("tablet");
    expect(validateDraft(d.config)).toEqual([]);
    const pults = d.config.pults as Array<{ id: string; placement?: string }>;
    expect(pults.map((p) => [p.id, p.placement])).toEqual([
      ["main", undefined],
      ["setup", "installation"],
    ]);
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
