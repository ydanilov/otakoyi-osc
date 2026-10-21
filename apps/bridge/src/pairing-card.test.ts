import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { pairingCard } from "./pairing-card";

describe("pairing card", () => {
  it("is a full-frame PNG with a square white QR area on the left and dark elsewhere", () => {
    const img = PNG.sync.read(
      pairingCard("otakoyi-control://connect?bridge=ws%3A%2F%2F10.0.0.5%3A8080%2Fws"),
    );
    expect([img.width, img.height]).toEqual([1280, 720]);
    const px = (x: number, y: number) => img.data[(y * img.width + x) * 4]!;
    expect(px(1200, 360)).toBe(11); // right side free for text
    expect(px(20, 20)).toBe(11); // background corner
    // the QR (black and white modules) sits in the left half; the right half stays background
    const row = (from: number, to: number) =>
      new Set(Array.from({ length: to - from }, (_, i) => px(from + i, 360)));
    expect(row(0, 640).has(0)).toBe(true);
    expect(row(0, 640).has(255)).toBe(true);
    expect([...row(700, 1280)]).toEqual([11]);
  });
});
