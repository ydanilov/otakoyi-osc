import type { Target } from "@osc/schema";

/**
 * Process supervisor of Otakoyi Runtime (ADR 011) — the seam where the bridge starts and watches the
 * installation software, so the client runs one program. Not implemented yet: the bridge currently
 * talks to software that was started by hand. Implementations live behind this interface (one per
 * platform), the bridge core never knows about TouchDesigner.
 */
export interface Supervisor {
  /** Start the target's software (e.g. TouchDesigner with the .toe in perform mode). */
  start(target: Target): Promise<void>;
  stop(target: Target): Promise<void>;
  /** Called by the bridge when the target's heartbeat address arrives. */
  heartbeat(targetId: string): void;
  status(targetId: string): "stopped" | "starting" | "running" | "crashed" | "hung";
}

/** Default: nothing to supervise — software is started outside the runtime. */
export const noSupervisor: Supervisor = {
  async start() {},
  async stop() {},
  heartbeat() {},
  status: () => "running",
};
