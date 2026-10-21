import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { Target } from "@osc/schema";
import {
  ProcessSupervisor,
  RESTART_BACKOFF_MS,
  STABLE_MS,
  commandFor,
  defaultExecutable,
  type ChildLike,
  type Clock,
  type SupervisorEvent,
} from "./process-supervisor";

/** Manual clock: timers fire only when time is advanced. */
function fakeClock(): Clock & { advance(ms: number): void } {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      timers.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (t) => {
      timers.delete(t as number);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
}

class FakeChild extends EventEmitter implements ChildLike {
  static pids = 100;
  pid = FakeChild.pids++;
  killed: string[] = [];
  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.killed.push(signal);
    // A real process exits shortly after a signal; ignore SIGTERM if told to hang on.
    if (!this.stubborn || signal === "SIGKILL")
      queueMicrotask(() => this.emit("exit", null, signal));
    return true;
  }
  constructor(public stubborn = false) {
    super();
  }
  crash(code = 1) {
    this.emit("exit", code, null);
  }
}

function setup(runtime: object = {}, stubborn = false) {
  const clock = fakeClock();
  const launched: { command: string; args: string[]; env: NodeJS.ProcessEnv; child: FakeChild }[] =
    [];
  const events: SupervisorEvent[] = [];
  const sup = new ProcessSupervisor({
    launch: (command, args, opts) => {
      const child = new FakeChild(stubborn);
      launched.push({ command, args, env: opts.env, child });
      return child;
    },
    platform: "win32",
    runtimeDir: "C:\\Otakoyi",
    clock,
    env: {},
    onEvent: (e) => events.push(e),
  });
  const target = Target.parse({
    id: "td",
    name: "TD",
    port: 7000,
    runtime: {
      app: "touchdesigner",
      project: "wall.toe",
      hangTimeoutS: 10,
      startupGraceS: 30,
      ...runtime,
    },
  });
  return { sup, clock, launched, events, target };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("commandFor", () => {
  it("TouchDesigner with the project, perform mode through OTAKOYI_PERFORM", () => {
    const t = Target.parse({
      id: "td",
      name: "TD",
      port: 7000,
      runtime: { app: "touchdesigner", project: "wall.toe" },
    });
    expect(commandFor(t, "win32", "C:\\Otakoyi")).toMatchObject({
      command: "C:\\Program Files\\Derivative\\TouchDesigner\\bin\\TouchDesigner.exe",
      env: { OTAKOYI_PERFORM: "1" },
    });
    expect(commandFor(t, "darwin", "/opt/otakoyi").args).toEqual(["/opt/otakoyi/wall.toe"]);
  });

  it("TouchPlayer, explicit executables and commands; Linux needs an executable", () => {
    const tp = Target.parse({
      id: "t",
      name: "T",
      port: 1,
      runtime: { app: "touchplayer", project: "/x/a.toe" },
    });
    expect(commandFor(tp, "darwin", "/r")).toEqual({
      command: "/Applications/TouchPlayer.app/Contents/MacOS/TouchPlayer",
      args: ["/x/a.toe"],
      env: {},
    });
    expect(() => commandFor(tp, "linux", "/r")).toThrow(/executable/);
    expect(defaultExecutable("touchdesigner", "linux")).toBeNull();
    const cmd = Target.parse({
      id: "c",
      name: "C",
      port: 1,
      runtime: { app: "command", command: ["node", "fake-td.js"] },
    });
    expect(commandFor(cmd, "linux", "/r")).toEqual({
      command: "node",
      args: ["fake-td.js"],
      env: {},
    });
  });
});

describe("ProcessSupervisor", () => {
  it("starts, becomes running on the first feedback, and restarts a crash with backoff", async () => {
    const { sup, clock, launched, target, events } = setup();
    await sup.start(target);
    expect(launched).toHaveLength(1);
    expect(launched[0]!.env.OTAKOYI_PERFORM).toBe("1");
    expect(sup.status("td")).toBe("starting");
    sup.heartbeat("td");
    expect(sup.status("td")).toBe("running");

    launched[0]!.child.crash();
    expect(sup.status("td")).toBe("crashed");
    clock.advance(RESTART_BACKOFF_MS[0]! - 1);
    expect(launched).toHaveLength(1);
    clock.advance(1);
    expect(launched).toHaveLength(2);
    launched[1]!.child.crash();
    clock.advance(RESTART_BACKOFF_MS[1]!);
    expect(launched).toHaveLength(3); // second delay is longer
    expect(events.filter((e) => e.event === "crash")).toHaveLength(2);
  });

  it("a long stable run resets the backoff", async () => {
    const { sup, clock, launched, target } = setup();
    await sup.start(target);
    launched[0]!.child.crash();
    clock.advance(RESTART_BACKOFF_MS[0]!);
    // Second run stays up long enough (with feedback) to count as stable.
    for (let i = 0; i < STABLE_MS / 5000; i++) {
      clock.advance(5000);
      sup.heartbeat("td");
    }
    launched[1]!.child.crash();
    clock.advance(RESTART_BACKOFF_MS[0]!);
    expect(launched).toHaveLength(3);
  });

  it("restarts a hung project: no feedback for hangTimeoutS after the startup grace", async () => {
    const { sup, clock, launched, target, events } = setup();
    await sup.start(target);
    clock.advance(29_000); // inside the 30 s grace: silence is fine
    expect(launched[0]!.child.killed).toEqual([]);
    sup.heartbeat("td");
    clock.advance(9_000);
    expect(launched[0]!.child.killed).toEqual([]);
    clock.advance(31_000); // 10 s after the grace end with no feedback
    expect(launched[0]!.child.killed).toEqual(["SIGKILL"]);
    await flush(); // exit
    expect(sup.status("td")).toBe("hung");
    expect(events.some((e) => e.event === "hang")).toBe(true);
    clock.advance(RESTART_BACKOFF_MS[0]!);
    expect(launched).toHaveLength(2);
    expect(sup.status("td")).toBe("starting");
  });

  it("stop is polite first and does not restart; restart resets and starts again", async () => {
    const { sup, clock, launched, target } = setup({}, true);
    await sup.start(target);
    const stopping = sup.stop(target);
    expect(launched[0]!.child.killed).toEqual(["SIGTERM"]); // stubborn: ignores it
    clock.advance(5000);
    await stopping;
    expect(launched[0]!.child.killed).toEqual(["SIGTERM", "SIGKILL"]);
    expect(sup.status("td")).toBe("stopped");
    clock.advance(120_000);
    expect(launched).toHaveLength(1); // a stop is not a crash

    const restarting = sup.restart(target);
    await restarting;
    expect(launched).toHaveLength(2);
    expect(sup.status("td")).toBe("starting");
  });

  it("restartOnCrash false: stays crashed; hangTimeoutS 0: never killed for silence", async () => {
    const a = setup({ restartOnCrash: false });
    await a.sup.start(a.target);
    a.launched[0]!.child.crash();
    a.clock.advance(600_000);
    expect(a.launched).toHaveLength(1);
    expect(a.sup.status("td")).toBe("crashed");

    const b = setup({ hangTimeoutS: 0 });
    await b.sup.start(b.target);
    b.clock.advance(600_000);
    expect(b.launched[0]!.child.killed).toEqual([]);
  });

  it("a launch error is reported and retried", async () => {
    const clock = fakeClock();
    let n = 0;
    const events: SupervisorEvent[] = [];
    const sup = new ProcessSupervisor({
      launch: () => {
        n++;
        throw new Error("ENOENT");
      },
      platform: "win32",
      runtimeDir: "C:\\",
      clock,
      onEvent: (e) => events.push(e),
    });
    const t = Target.parse({
      id: "td",
      name: "TD",
      port: 1,
      runtime: { app: "touchplayer", project: "a.toe" },
    });
    await sup.start(t);
    expect(events.find((e) => e.event === "error")).toMatchObject({ message: "ENOENT" });
    clock.advance(RESTART_BACKOFF_MS[0]!);
    expect(n).toBe(2);
  });
});
