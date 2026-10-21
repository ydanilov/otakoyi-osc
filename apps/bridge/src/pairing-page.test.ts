import { describe, expect, it } from "vitest";
import { isLoopback, pairingPage } from "./pairing-page";

describe("pairing page", () => {
  it("is only served to this machine", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("192.168.1.30")).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
  it("renders a card per address and escapes the installation name", async () => {
    const html = await pairingPage({
      name: "<Lobby>",
      port: 8080,
      pin: "2468",
      hosts: ["10.0.0.5", "192.168.1.20"],
      localOnly: false,
    });
    expect(html).toContain("&lt;Lobby&gt;");
    expect(html).not.toContain("<Lobby>");
    expect(html.match(/<section class="card">/g)?.length).toBe(2);
    expect(html).toContain("http://192.168.1.20:8080/?pin=2468");
  });
});
