import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { Control, type ControlOf } from "@osc/schema";
import { ImageLibrary, detectFormat, validateImage } from "./images";
import { PromptStore } from "./prompts";

const dir = () => mkdtemp(join(tmpdir(), "bridge-data-"));

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const WEBP = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]);
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...ascii("ftypheic"), 0, 0]);
const GIF = new Uint8Array(ascii("GIF89a.."));

const imageControl = (props: object = {}) =>
  Control.parse({ id: "photo", type: "image", address: "/img", ...props }) as ControlOf<"image">;

describe("image validation", () => {
  it("detects the format from the content, not the name", () => {
    expect(detectFormat(JPEG)).toBe("jpeg");
    expect(detectFormat(PNG)).toBe("png");
    expect(detectFormat(WEBP)).toBe("webp");
    expect(detectFormat(HEIC)).toBe("heic");
    expect(detectFormat(GIF)).toBe("gif");
    expect(detectFormat(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("checks the control's formats and size", () => {
    const c = imageControl({ formats: ["jpeg", "png"], maxMB: 0.001 });
    expect(validateImage(c, JPEG)).toEqual({ ok: true, format: "jpeg" });
    expect(validateImage(c, GIF)).toMatchObject({ ok: false, status: 415 });
    expect(validateImage(c, new Uint8Array(2000).fill(0xff))).toMatchObject({
      ok: false,
      status: 413,
    });
    expect(validateImage(c, new Uint8Array())).toMatchObject({ ok: false, status: 400 });
  });
});

describe("ImageLibrary", () => {
  it("stores files under uploads with absolute paths and persists the list", async () => {
    const d = await dir();
    const lib = new ImageLibrary(d, () => 0);
    const a = await lib.add({
      pultId: "live",
      controlId: "photo",
      name: "../../etc/passwd.jpg",
      format: "jpeg",
      bytes: JPEG,
    });
    expect(isAbsolute(a.path)).toBe(true);
    expect(a.path.startsWith(join(d, "uploads"))).toBe(true);
    expect(a.path.endsWith(".jpg")).toBe(true);
    expect(a.name).not.toContain("/");
    expect(new Uint8Array(await readFile(a.path))).toEqual(JPEG);

    const again = new ImageLibrary(d);
    expect((await again.list({ controlId: "photo" })).map((x) => x.id)).toEqual([a.id]);
    expect(await again.remove(a.id)).toBe(true);
    await expect(stat(a.path)).rejects.toThrow();
    expect(await new ImageLibrary(d).list()).toEqual([]);
  });

  it("without a library, a new upload replaces the control's previous one", async () => {
    const lib = new ImageLibrary(await dir());
    const input = { pultId: "p", controlId: "c", name: "x", format: "png" as const, bytes: PNG };
    await lib.add(input, false);
    const b = await lib.add(input, false);
    expect((await lib.list()).map((x) => x.id)).toEqual([b.id]);
  });
});

describe("PromptStore", () => {
  const limits = { maxLength: 20, maxPresets: 2 };

  it("creates, updates, toggles, deletes and persists presets", async () => {
    const d = await dir();
    const store = new PromptStore(d, () => Date.parse("2026-10-21T10:00:00Z"));
    const r = await store.create("live", "prompt", limits, {
      label: " Forest ",
      text: "misty forest",
    });
    if (!r.ok) throw new Error(r.message);
    expect(r.value).toMatchObject({
      label: "Forest",
      on: true,
      createdAt: "2026-10-21T10:00:00.000Z",
    });
    const u = await store.update(r.value.id, limits, { on: false });
    expect(u).toMatchObject({ ok: true, value: { on: false, text: "misty forest" } });

    const reloaded = new PromptStore(d);
    expect(await reloaded.list("live", "prompt")).toHaveLength(1);
    expect(await reloaded.list("live", "other")).toHaveLength(0);
    expect(await reloaded.remove(r.value.id)).toMatchObject({ id: r.value.id });
    expect(await new PromptStore(d).list("live", "prompt")).toEqual([]);
  });

  it("enforces the control's limits", async () => {
    const store = new PromptStore(await dir());
    expect(await store.create("p", "c", limits, { label: "", text: "x" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await store.create("p", "c", limits, { label: "L", text: "x".repeat(21) }),
    ).toMatchObject({ ok: false, status: 400 });
    await store.create("p", "c", limits, { label: "A", text: "a" });
    await store.create("p", "c", limits, { label: "B", text: "b" });
    expect(await store.create("p", "c", limits, { label: "C", text: "c" })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(await store.update("nope", limits, { on: true })).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
