import { describe, expect, it } from "vitest";
import { BridgeHttpError, createBridgeHttp, httpBaseOf } from "./http";

function fakeFetch(status = 200, body: unknown = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("bridge HTTP client", () => {
  it("derives the HTTP base from the socket URL", () => {
    expect(httpBaseOf("ws://192.168.1.20:8080/ws")).toBe("http://192.168.1.20:8080");
    expect(httpBaseOf("wss://bridge.example/ws?x=1")).toBe("https://bridge.example");
  });

  it("sends auth headers, paths and bodies", async () => {
    const { f, calls } = fakeFetch(201, { id: "img1" });
    const api = createBridgeHttp({ base: "http://b", device: "phone", secret: "1234", fetch: f });
    await api.images.upload("live", "photo", new Uint8Array([1, 2]), "a b.jpg");
    await api.prompts.update("p1", { on: false });
    expect(calls[0]!.url).toBe("http://b/api/images?pult=live&control=photo&name=a%20b.jpg");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({
      "x-otakoyi-device": "phone",
      "x-otakoyi-secret": "1234",
    });
    expect(calls[1]!.init).toMatchObject({ method: "PATCH", body: '{"on":false}' });
  });

  it("turns error responses into BridgeHttpError with the bridge's message", async () => {
    const { f } = fakeFetch(415, { error: "gif is not accepted here" });
    const api = createBridgeHttp({ base: "http://b", device: "d", fetch: f });
    const err = await api.images.upload("p", "c", new Uint8Array([1])).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeHttpError);
    expect(err).toMatchObject({ status: 415, message: "gif is not accepted here" });
  });
});
