import { describe, expect, it } from "vitest";
import { bridgeFromAddress, checkPin, pairingUrl, parsePairing, webPultUrl } from "./pairing";

describe("pairing links", () => {
  const p = { bridge: "ws://192.168.1.20:8080/ws", pin: "2468", name: "Lobby wall" };
  it("round-trips through the app deep link", () => {
    const url = pairingUrl(p);
    expect(url.startsWith("otakoyi-control://connect?")).toBe(true);
    expect(parsePairing(url)).toEqual(p);
  });
  it("builds the web pult URL", () => {
    expect(webPultUrl(p)).toBe("http://192.168.1.20:8080/?pin=2468");
  });
  it("rejects anything that is not a ws(s) bridge", () => {
    expect(parsePairing({ bridge: "http://evil.example/ws" })).toBeNull();
    expect(parsePairing({ bridge: "javascript:alert(1)" })).toBeNull();
    expect(parsePairing("otakoyi-control://connect")).toBeNull();
    expect(parsePairing({ bridge: "wss://bridge.local/ws" })).toMatchObject({
      bridge: "wss://bridge.local/ws",
    });
  });
});

describe("enter address and PIN", () => {
  const ok = (s: string) => {
    const r = bridgeFromAddress(s);
    return r.ok ? r.bridge : null;
  };
  it("turns what is printed under the QR into a socket URL", () => {
    expect(ok("192.168.1.20")).toBe("ws://192.168.1.20:8080/ws");
    expect(ok(" 192.168.1.20:9000 ")).toBe("ws://192.168.1.20:9000/ws");
    expect(ok("http://lobby.local:8080/")).toBe("ws://lobby.local:8080/ws");
    expect(ok("ws://10.0.0.5:8080/ws")).toBe("ws://10.0.0.5:8080/ws");
    expect(ok("https://bridge.example")).toBe("wss://bridge.example:8080/ws");
    expect(ok("[fe80::1]:8080")).toBe("ws://[fe80::1]:8080/ws");
  });
  it("refuses what is not an address", () => {
    for (const bad of [
      "",
      "   ",
      "192.168.1",
      "300.1.1.1",
      "a b",
      "ftp://x",
      "host:0",
      "host:70000",
    ])
      expect(ok(bad), bad).toBeNull();
    const r = bridgeFromAddress("192.168.1");
    expect(r.ok ? "" : r.message).toMatch(/IP address/);
  });
  it("checks the PIN is 4 digits", () => {
    expect(checkPin("2468").ok).toBe(true);
    expect(checkPin("246").ok).toBe(false);
    expect(checkPin("24a8")).toEqual({ ok: false, message: "The PIN is digits only" });
    expect(checkPin("24680").ok).toBe(false);
  });
});
