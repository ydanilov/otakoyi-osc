import { isAbsolute, resolve } from "node:path";
import type { Target } from "@osc/schema";
import type { Supervisor } from "@osc/bridge-core";

/** The part of a child process the supervisor uses (node's ChildProcess fits; tests pass a fake). */
export interface ChildLike {
  readonly pid?: number | undefined;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "exit", fn: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: "error", fn: (err: Error) => void): unknown;
}

export type Launcher = (
  command: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
) => ChildLike;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
}

export type SupervisorEvent = {
  target: string;
  event: "start" | "exit" | "crash" | "hang" | "restart" | "stop" | "error";
  [k: string]: unknown;
};

/** Delay before restarting after a crash or hang; the last one repeats. Reset after a stable run. */
export const RESTART_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000, 60000];
/** A run this long without a crash resets the backoff. */
export const STABLE_MS = 60_000;
/** How long `stop` waits for a polite exit before killing. */
export const STOP_GRACE_MS = 5000;
/** Watchdog period. */
const WATCH_MS = 1000;

/** Standard install locations; `runtime.executable` overrides them. */
export function defaultExecutable(
  app: "touchdesigner" | "touchplayer",
  platform: NodeJS.Platform,
): string | null {
  const name = app === "touchdesigner" ? "TouchDesigner" : "TouchPlayer";
  if (platform === "win32") return `C:\\Program Files\\Derivative\\TouchDesigner\\bin\\${name}.exe`;
  if (platform === "darwin") return `/Applications/${name}.app/Contents/MacOS/${name}`;
  return null; // TouchDesigner does not run on Linux: set `executable` (e.g. for a `command` target)
}

/** What to launch for a target (ADR-011). */
export function commandFor(
  t: Target,
  platform: NodeJS.Platform,
  runtimeDir: string,
): { command: string; args: string[]; env: Record<string, string> } {
  const rt = t.runtime;
  if (!rt) throw new Error(`target ${t.id} has no runtime`);
  if (rt.app === "command") {
    const [command, ...args] = rt.command ?? [];
    if (!command) throw new Error(`target ${t.id}: runtime.command is empty`);
    return { command, args, env: {} };
  }
  const command = rt.executable ?? defaultExecutable(rt.app, platform);
  if (!command) throw new Error(`target ${t.id}: set runtime.executable on ${platform}`);
  if (!rt.project) throw new Error(`target ${t.id}: runtime.project (.toe) is missing`);
  const project = isAbsolute(rt.project) ? rt.project : resolve(runtimeDir, rt.project);
  // TouchPlayer is always in perform mode. TouchDesigner has no command-line switch for it: the
  // project reads OTAKOYI_PERFORM (tools/touchdesigner) or uses "Start in Perform Mode".
  const env: Record<string, string> =
    rt.app === "touchdesigner" && rt.perform ? { OTAKOYI_PERFORM: "1" } : {};
  return { command, args: [project], env };
}

type Status = ReturnType<Supervisor["status"]>;

interface Run {
  target: Target;
  status: Status;
  child: ChildLike | null;
  startedAt: number;
  lastBeat: number | null;
  attempt: number;
  stopping: boolean;
  timer: unknown;
  watch: unknown;
}

/**
 * Otakoyi Runtime's process supervisor (ADR-011): starts TouchDesigner / TouchPlayer (or any
 * command) with the project, restarts it when it crashes or hangs (no feedback for
 * `runtime.hangTimeoutS` after `startupGraceS`), with backoff. The process launcher and the clock
 * are injected, so it is tested without a real TouchDesigner.
 */
export class ProcessSupervisor implements Supervisor {
  private runs = new Map<string, Run>();

  constructor(
    private opts: {
      launch: Launcher;
      platform?: NodeJS.Platform;
      /** Folder relative project paths are resolved against (the config's folder). */
      runtimeDir: string;
      clock?: Clock;
      env?: NodeJS.ProcessEnv;
      onEvent?: (e: SupervisorEvent) => void;
    },
  ) {}

  private get clock(): Clock {
    return (
      this.opts.clock ?? {
        now: () => Date.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      }
    );
  }

  status(targetId: string): Status {
    return this.runs.get(targetId)?.status ?? "stopped";
  }

  async start(target: Target): Promise<void> {
    if (!target.runtime) return;
    const run = this.runs.get(target.id) ?? {
      target,
      status: "stopped" as Status,
      child: null,
      startedAt: 0,
      lastBeat: null,
      attempt: 0,
      stopping: false,
      timer: null,
      watch: null,
    };
    run.target = target;
    run.stopping = false;
    this.runs.set(target.id, run);
    if (run.child) return;
    this.spawn(run);
  }

  async stop(target: Target): Promise<void> {
    const run = this.runs.get(target.id);
    if (!run) return;
    run.stopping = true;
    this.clearTimers(run);
    const child = run.child;
    if (!child) {
      run.status = "stopped";
      return;
    }
    await new Promise<void>((done) => {
      const force = this.clock.setTimeout(() => child.kill("SIGKILL"), STOP_GRACE_MS);
      child.once("exit", () => {
        this.clock.clearTimeout(force);
        done();
      });
      child.kill("SIGTERM");
    });
    run.status = "stopped";
    this.emit(run, "stop");
  }

  /** The Restart action: stop, then start right away (resets the crash backoff). */
  async restart(target: Target): Promise<void> {
    this.emit(this.runs.get(target.id) ?? null, "restart", { target: target.id });
    await this.stop(target);
    const run = this.runs.get(target.id);
    if (run) run.attempt = 0;
    await this.start(target);
  }

  /** Any feedback from the target (wired by the bridge): it is alive. */
  heartbeat(targetId: string) {
    const run = this.runs.get(targetId);
    if (!run || !run.child) return;
    const now = this.clock.now();
    run.lastBeat = now;
    if (run.status === "starting") run.status = "running";
    if (now - run.startedAt >= STABLE_MS) run.attempt = 0;
  }

  async stopAll() {
    await Promise.all([...this.runs.values()].map((r) => this.stop(r.target)));
  }

  private spawn(run: Run) {
    const t = run.target;
    let cmd: ReturnType<typeof commandFor>;
    try {
      cmd = commandFor(t, this.opts.platform ?? process.platform, this.opts.runtimeDir);
    } catch (e) {
      run.status = "crashed";
      this.emit(run, "error", { message: (e as Error).message });
      return;
    }
    run.status = "starting";
    run.startedAt = this.clock.now();
    run.lastBeat = null;
    let child: ChildLike;
    try {
      child = this.opts.launch(cmd.command, cmd.args, {
        cwd: this.opts.runtimeDir,
        env: { ...(this.opts.env ?? process.env), ...cmd.env },
      });
    } catch (e) {
      this.emit(run, "error", { message: (e as Error).message });
      return this.crashed(run, "spawn failed");
    }
    run.child = child;
    this.emit(run, "start", { command: cmd.command, args: cmd.args, pid: child.pid });
    child.once("error", (e) => this.emit(run, "error", { message: e.message }));
    child.once("exit", (code, signal) => {
      if (run.child !== child) return;
      run.child = null;
      this.clearTimers(run);
      this.emit(run, "exit", { code, signal });
      if (run.stopping) return;
      this.crashed(run, run.status === "hung" ? "hang" : "crash");
    });
    this.watch(run);
  }

  /** Restart after a crash / hang, with backoff (unless `restartOnCrash` is off). */
  private crashed(run: Run, why: "crash" | "hang" | "spawn failed") {
    if (run.status !== "hung") run.status = "crashed";
    if (why !== "hang") this.emit(run, "crash", { why });
    if (!run.target.runtime?.restartOnCrash) return;
    if (this.clock.now() - run.startedAt >= STABLE_MS) run.attempt = 0;
    const delay = RESTART_BACKOFF_MS[Math.min(run.attempt++, RESTART_BACKOFF_MS.length - 1)]!;
    run.timer = this.clock.setTimeout(() => {
      run.timer = null;
      if (!run.stopping) this.spawn(run);
    }, delay);
  }

  /** Hang detection: no feedback for hangTimeoutS once the startup grace is over. */
  private watch(run: Run) {
    const rt = run.target.runtime!;
    const tick = () => {
      run.watch = null;
      if (!run.child || run.stopping) return;
      const now = this.clock.now();
      const graceEnd = run.startedAt + rt.startupGraceS * 1000;
      const since = Math.max(run.lastBeat ?? graceEnd, graceEnd);
      if (rt.hangTimeoutS > 0 && now >= graceEnd && now - since >= rt.hangTimeoutS * 1000) {
        run.status = "hung";
        this.emit(run, "hang", { silentMs: now - since });
        run.child.kill("SIGKILL"); // the exit handler schedules the restart
        return;
      }
      run.watch = this.clock.setTimeout(tick, WATCH_MS);
    };
    run.watch = this.clock.setTimeout(tick, WATCH_MS);
  }

  private clearTimers(run: Run) {
    if (run.timer !== null) this.clock.clearTimeout(run.timer);
    if (run.watch !== null) this.clock.clearTimeout(run.watch);
    run.timer = null;
    run.watch = null;
  }

  private emit(
    run: Run | null,
    event: SupervisorEvent["event"],
    extra: Record<string, unknown> = {},
  ) {
    this.opts.onEvent?.({ target: run?.target.id ?? String(extra.target ?? ""), event, ...extra });
  }
}
