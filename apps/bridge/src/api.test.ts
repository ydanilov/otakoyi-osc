import { createSocket } from "node:dgram";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { argValue, decodePacket, messagesOf, type OscMessage } from "@osc/core";
import { parseConfig } from "@osc/schema";
import { WebSocket } from "ws";
import demo from "../../../design-system/packages/schema/examples/demo-installation.json";
import { startServer } from "./server";

const closers: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = new TextEncoder().encode("GIF89a....");

async function setup() {
  const td = createSocket("udp4");
  await new Promise<void>((ok) => td.bind(0, "127.0.0.1", ok));
  closers.push(() => {
    td.close();
  });
  const received: OscMessage[] = [];
  td.on("message", (b) => received.push(...messagesOf(decodePacket(new Uint8Array(b)))));
  const cfg = structuredClone(demo) as typeof demo;
  cfg.targets[0]!.port = (td.address() as { port: number }).port;
  delete (cfg.targets[0] as { feedbackPort?: number }).feedbackPort;
  const parsed = parseConfig(cfg);
  if (!parsed.ok) throw new Error("config");
  const tmp = await mkdtemp(join(tmpdir(), "bridge-api-"));
  const server = await startServer({
    config: parsed.config,
    port: 0,
    host: "127.0.0.1",
    logDir: join(tmp, "logs"),
    dataDir: join(tmp, "data"),
    auth: { clientPin: "1234", studioKey: "studio-key" },
    quiet: true,
    mdns: false,
  });
  closers.push(() => server.close());
  const base = `http://127.0.0.1:${server.port}`;
  const call = (path: string, init: RequestInit & { device?: string; secret?: string } = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        "x-otakoyi-secret": init.secret ?? "1234",
        "x-otakoyi-device": init.device ?? "phone",
        ...(init.headers ?? {}),
      },
    });
  /** Connect a device over the socket so it gets the lease. */
  const connect = async (device: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    closers.unshift(() => ws.close());
    const inbox: { t: string }[] = [];
    ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
    await new Promise((ok) => ws.on("open", ok));
    ws.send(JSON.stringify({ t: "hello", v: 1, device, role: "client", secret: "1234" }));
    await until(() => inbox.find((m) => m.t === "lease"));
    return inbox;
  };
  return { call, connect, received, tmp };
}

function until<T>(fn: () => T | undefined, ms = 2000): Promise<T> {
  return new Promise((ok, fail) => {
    const start = Date.now();
    const poll = () => {
      const v = fn();
      if (v !== undefined) return ok(v);
      if (Date.now() - start > ms) return fail(new Error("timeout"));
      setTimeout(poll, 10);
    };
    poll();
  });
}

describe("image upload API", () => {
  it("validates, stores, lists and sends <address> <absolute path>", async () => {
    const { call, connect, received, tmp } = await setup();
    const inbox = await connect("phone");

    const up = await call("/api/images?pult=live&control=photo&name=guest.jpg", {
      method: "POST",
      body: JPEG,
    });
    expect(up.status).toBe(201);
    const asset = await up.json();
    expect(asset).toMatchObject({
      pultId: "live",
      controlId: "photo",
      format: "jpeg",
      name: "guest.jpg",
    });
    expect(isAbsolute(asset.path)).toBe(true);
    expect(asset.path.startsWith(join(tmp, "data", "demo", "uploads"))).toBe(true);

    const osc = await until(() => received.find((m) => m.address === "/live/image"));
    expect(argValue(osc.args[0]!)).toBe(asset.path);
    const list = await (await call("/api/images?pult=live&control=photo")).json();
    expect(list.map((a: { id: string }) => a.id)).toEqual([asset.id]);
    // The new value is synced to devices (the uploader gets it too: it came over HTTP).
    await until(() => inbox.find((m) => m.t === "value"));

    received.length = 0;
    expect((await call(`/api/images/${asset.id}/show`, { method: "POST" })).status).toBe(200);
    await until(() => received.find((m) => m.address === "/live/image"));

    expect((await call(`/api/images/${asset.id}`, { method: "DELETE" })).status).toBe(200);
    expect(await (await call("/api/images")).json()).toEqual([]);
  });

  it("rejects wrong formats, oversize files, bad PINs, unknown controls and devices without the lease", async () => {
    const { call, connect } = await setup();
    await connect("phone");
    const post = (path: string, body: BodyInit, extra: { device?: string; secret?: string } = {}) =>
      call(path, { method: "POST", body, ...extra });

    expect((await post("/api/images?pult=live&control=photo", GIF)).status).toBe(415);
    expect(
      (await post("/api/images?pult=live&control=photo", new Uint8Array(11 * 1024 * 1024))).status,
    ).toBe(413);
    expect(
      (await post("/api/images?pult=live&control=photo", JPEG, { secret: "0000" })).status,
    ).toBe(401);
    expect((await post("/api/images?pult=live&control=mic", JPEG)).status).toBe(404);
    expect(
      (await post("/api/images?pult=live&control=photo", JPEG, { device: "tablet" })).status,
    ).toBe(409);
    // The studio may always.
    expect(
      (
        await post("/api/images?pult=live&control=photo", JPEG, {
          device: "studio",
          secret: "studio-key",
        })
      ).status,
    ).toBe(201);
  });
});

describe("prompt presets API: duplicate, reorder, delete + undo", () => {
  it("works over HTTP and tells other pults to refetch", async () => {
    const { call, connect } = await setup();
    const inbox = await connect("phone");
    const json = { "content-type": "application/json" };
    const make = async (label: string) =>
      (
        await call("/api/prompts?pult=live&control=prompt", {
          method: "POST",
          headers: json,
          body: JSON.stringify({ label, text: label }),
        })
      ).json();
    const a = await make("A");
    const b = await make("B");
    const dup = await (await call(`/api/prompts/${a.id}/duplicate`, { method: "POST" })).json();
    expect(dup.label).toBe("A copy");
    const order = await call("/api/prompts/order?pult=live&control=prompt", {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ ids: [b.id, dup.id, a.id] }),
    });
    expect((await order.json()).map((p: { label: string }) => p.label)).toEqual([
      "B",
      "A copy",
      "A",
    ]);
    const del = await (await call(`/api/prompts/${b.id}`, { method: "DELETE" })).json();
    expect(del).toMatchObject({ ok: true, undoMs: 30000 });
    expect((await call(`/api/prompts/${b.id}/restore`, { method: "POST" })).status).toBe(200);
    const list = await (await call("/api/prompts?pult=live&control=prompt")).json();
    expect(list.map((p: { label: string }) => p.label)).toEqual(["B", "A copy", "A"]);
    await until(() => inbox.find((m) => m.t === "data"));
    // Without the lease: refused.
    expect(
      (await call(`/api/prompts/${a.id}`, { method: "DELETE", device: "tablet" })).status,
    ).toBe(409);
  });
});

describe("prompt presets API", () => {
  it("CRUD, persisted per installation", async () => {
    const { call, connect } = await setup();
    await connect("phone");
    const json = { "content-type": "application/json" };
    const created = await call("/api/prompts?pult=live&control=prompt", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ label: "Forest", text: "misty forest at dawn" }),
    });
    expect(created.status).toBe(201);
    const p = await created.json();
    expect(p).toMatchObject({ label: "Forest", on: true, pultId: "live", controlId: "prompt" });

    const patched = await call(`/api/prompts/${p.id}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ on: false }),
    });
    expect((await patched.json()).on).toBe(false);
    const list = await (await call("/api/prompts?pult=live&control=prompt")).json();
    expect(list).toHaveLength(1);

    const tooLong = await call("/api/prompts?pult=live&control=prompt", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ label: "X", text: "x".repeat(501) }),
    });
    expect(tooLong.status).toBe(400);
    expect((await call("/api/prompts?pult=live&control=photo")).status).toBe(404);
    expect((await call(`/api/prompts/${p.id}`, { method: "DELETE" })).status).toBe(200);
    expect(await (await call("/api/prompts?pult=live&control=prompt")).json()).toEqual([]);
  });
});
