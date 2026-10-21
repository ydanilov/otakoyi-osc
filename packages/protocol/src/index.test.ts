import { describe, expect, it } from "vitest";
import { modeFor, parseClientMessage } from "./index";

describe("protocol v2", () => {
  it("parses installation actions and modes", () => {
    expect(parseClientMessage('{"t":"action","name":"flash"}')).toEqual({
      t: "action",
      name: "flash",
    });
    expect(parseClientMessage('{"t":"action","name":"blackout","on":true}')).toMatchObject({
      on: true,
    });
    expect(parseClientMessage('{"t":"mode","mode":"idle","on":false}')).toEqual({
      t: "mode",
      mode: "idle",
      on: false,
    });
    expect(parseClientMessage('{"t":"action","name":"selfdestruct"}')).toBeNull();
    expect(parseClientMessage('{"t":"mode","mode":"idle"}')).toBeNull();
  });
});

describe("protocol", () => {
  it("parses valid messages and rejects junk", () => {
    expect(parseClientMessage('{"t":"take"}')).toEqual({ t: "take" });
    expect(
      parseClientMessage('{"t":"set","pult":"lobby","id":"intensity","value":0.5}'),
    ).toMatchObject({
      t: "set",
      value: 0.5,
    });
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage('{"t":"hello","v":1,"device":"","role":"client"}')).toBeNull();
    expect(parseClientMessage('{"t":"hello","v":1,"device":"a","role":"admin"}')).toBeNull();
  });
  it("derives the device mode from the lease", () => {
    expect(modeFor({ device: "a", role: "client" }, "a")).toBe("control");
    expect(modeFor({ device: "a", role: "client" }, "b")).toBe("view");
    expect(modeFor({ device: "s", role: "studio" }, "b")).toBe("studio-has-control");
    expect(modeFor(null, "b")).toBe("view");
  });
});
