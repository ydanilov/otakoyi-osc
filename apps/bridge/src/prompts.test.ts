import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { argValue, message, type OscMessage } from "@osc/core";
import { promptValue } from "@osc/controls";
import type { ServerMessage } from "@osc/protocol";
import { parseConfig } from "@osc/schema";
import demo from "../../../packages/schema/examples/demo-installation.json";
import { Bridge, type Peer } from "@osc/bridge-core";
import { PromptStore, UNDO_WINDOW_MS } from "./prompts";

const limits = { maxLength: 500, maxPresets: 10 };

async function store() {
  let now = Date.parse("2026-10-22T10:00:00Z");
  const s = new PromptStore(await mkdtemp(join(tmpdir(), "prompts-")), () => now);
  const add = async (label: string) => {
    const r = await s.create("live", "prompt", limits, { label, text: label.toLowerCase() });
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };
  return { s, add, advance: (ms: number) => (now += ms) };
}

describe("PromptStore: soft delete, undo, reorder, duplicate", () => {
  it("a delete can be undone within the window, in its old place", async () => {
    const { s, add, advance } = await store();
    const a = await add("A");
    const b = await add("B");
    await add("C");
    expect(await s.remove(b.id)).toMatchObject({ id: b.id, deletedAt: expect.any(String) });
    expect((await s.list("live", "prompt")).map((p) => p.label)).toEqual(["A", "C"]);
    advance(5000);
    expect(await s.restore(b.id, limits)).toMatchObject({ ok: true, value: { label: "B" } });
    expect((await s.list("live", "prompt")).map((p) => p.label)).toEqual(["A", "B", "C"]);
    // Too late: purged.
    await s.remove(a.id);
    advance(UNDO_WINDOW_MS + 1);
    expect(await s.restore(a.id, limits)).toMatchObject({ ok: false, status: 410 });
    expect(await s.get(a.id)).toBeUndefined();
  });

  it("reorder is persisted and must name every preset once", async () => {
    const { s, add } = await store();
    const a = await add("A");
    const b = await add("B");
    const c = await add("C");
    const r = await s.reorder("live", "prompt", [c.id, a.id, b.id]);
    expect(r.ok && r.value.map((p) => p.label)).toEqual(["C", "A", "B"]);
    expect(await s.reorder("live", "prompt", [c.id, a.id])).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await s.reorder("live", "prompt", [c.id, c.id, a.id])).toMatchObject({ ok: false });
  });

  it("duplicate lands right after the original", async () => {
    const { s, add } = await store();
    const a = await add("A");
    await add("B");
    const d = await s.duplicate(a.id, limits);
    expect(d).toMatchObject({ ok: true, value: { label: "A copy", text: "a" } });
    expect((await s.list("live", "prompt")).map((p) => p.label)).toEqual(["A", "A copy", "B"]);
  });
});

function bridgeSetup(confirmMs?: number) {
  const cfg = structuredClone(demo) as any;
  if (confirmMs !== undefined)
    cfg.pults
      .find((p: any) => p.id === "live")
      .pages[1].controls.find((c: any) => c.id === "prompt").confirmMs = confirmMs;
  const r = parseConfig(cfg);
  if (!r.ok) throw new Error("config");
  let now = 1_000_000;
  const osc: OscMessage[] = [];
  const bridge = new Bridge(r.config, {
    sendOsc: (_t, m) => osc.push(...m),
    log: () => {},
    now: () => now,
  });
  const inbox: ServerMessage[] = [];
  const p: Peer = { send: (m) => inbox.push(m), close: () => {} };
  bridge.connect(p);
  const say = (m: object) => bridge.handle(p, JSON.stringify(m));
  say({ t: "hello", v: 2, device: "a", role: "client" });
  const acks = () => inbox.flatMap((m) => (m.t === "prompt" ? [`${m.state}:${m.seq}`] : []));
  return { bridge, osc, say, inbox, acks, advance: (ms: number) => (now += ms) };
}

const presets = [
  { id: "forest", text: "misty forest", on: true },
  { id: "city", text: "neon city", on: true },
];

describe("prompt confirmation (Applying → On / Error)", () => {
  it("applying, then applied when the installation echoes the text", () => {
    const { bridge, say, acks } = bridgeSetup();
    say({
      t: "set",
      pult: "live",
      id: "prompt",
      value: promptValue(presets, { a: "forest", mix: 0 }, 500),
    });
    expect(acks()).toEqual(["applying:1"]);
    bridge.feedback("td", message("/live/prompt/a", "old text")); // not ours
    expect(acks()).toEqual(["applying:1"]);
    bridge.feedback("td", message("/live/prompt/a", "misty forest"));
    expect(acks()).toEqual(["applying:1", "applied:1"]);
  });

  it("or an explicit <address>/applied; error after confirmMs; a retry gets a new seq", () => {
    const { bridge, say, acks, advance } = bridgeSetup();
    const v = promptValue(presets, { a: "city", mix: 0 }, 500);
    say({ t: "set", pult: "live", id: "prompt", value: v });
    advance(4001);
    bridge.tick();
    expect(acks()).toEqual(["applying:1", "error:1"]);
    say({ t: "set", pult: "live", id: "prompt", value: v }); // tap on the Error card retries
    bridge.feedback("td", message("/live/prompt/applied"));
    expect(acks()).toEqual(["applying:1", "error:1", "applying:2", "applied:2"]);
  });

  it("confirmMs 0: applied at once", () => {
    const { say, acks } = bridgeSetup(0);
    say({
      t: "set",
      pult: "live",
      id: "prompt",
      value: promptValue(presets, { a: "city", mix: 0 }, 500),
    });
    expect(acks()).toEqual(["applied:1"]);
  });

  it("deleting the live preset returns the installation to its base look", () => {
    const { bridge, say, osc, inbox } = bridgeSetup();
    say({
      t: "set",
      pult: "live",
      id: "prompt",
      value: promptValue(presets, { a: "forest", b: "city", mix: 0.3 }, 500),
    });
    osc.length = 0;
    const who = { device: "a", role: "client" as const };
    bridge.dataChanged("live", "prompt", "prompts", who, { op: "delete", preset: "forest" });
    expect(bridge.reapplyPrompt("live", "prompt", [presets[1]!], "forest", who)).toBe(true);
    expect(osc.map((m) => [m.address, ...m.args.map(argValue)])).toEqual([
      ["/live/prompt/a", ""],
      ["/live/prompt/b", "neon city"],
      ["/live/prompt/mix", 0.3],
    ]);
    expect(inbox.some((m) => m.t === "data" && m.kind === "prompts")).toBe(true);
    expect(bridge.reapplyPrompt("live", "prompt", [], "sea", who)).toBe(false); // not live
  });
});
