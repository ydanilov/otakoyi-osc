import { describe, expect, it } from "vitest";
import { pairingUrl, parsePairing, webPultUrl } from "./pairing";

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
