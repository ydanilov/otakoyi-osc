import { describe, expect, it } from "vitest";
import { Lease } from "./lease";

const a = { device: "a", role: "client" as const };
const b = { device: "b", role: "client" as const };
const s = { device: "s", role: "studio" as const };

describe("Lease", () => {
  it("auto-grants a free lease to the first client only", () => {
    const l = new Lease();
    expect(l.offer(a)).toBe(true);
    expect(l.offer(b)).toBe(false);
    expect(l.canSend("a")).toBe(true);
    expect(l.canSend("b")).toBe(false);
  });
  it("lets a client take control from another client", () => {
    const l = new Lease();
    l.offer(a);
    expect(l.take(b)).toBe(true);
    expect(l.holder?.device).toBe("b");
  });
  it("always gives the studio priority", () => {
    const l = new Lease();
    l.offer(a);
    expect(l.take(s)).toBe(true);
    expect(l.take(a)).toBe(false);
    expect(l.offer(b)).toBe(false);
    expect(l.release("s")).toBe(true);
    expect(l.take(a)).toBe(true);
  });
  it("never auto-grants to the studio and frees the lease when the holder leaves", () => {
    const l = new Lease();
    expect(l.offer(s)).toBe(false);
    l.offer(a);
    expect(l.release("b")).toBe(false);
    expect(l.release("a")).toBe(true);
    expect(l.holder).toBeNull();
  });
});
