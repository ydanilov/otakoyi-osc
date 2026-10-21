import type { Holder } from "@osc/protocol";

/**
 * The control lease: one device controls, the others view, and the studio always wins.
 * - A free lease goes to the first client that connects (or asks).
 * - A client may take it from another client ("Take control"), never from the studio.
 * - The studio takes it from anyone; when the studio releases or leaves, it is free again.
 */
export class Lease {
  holder: Holder | null = null;

  /** Returns true when the holder changed. */
  take(who: Holder): boolean {
    if (this.holder?.device === who.device) return false;
    if (this.holder?.role === "studio" && who.role !== "studio") return false;
    this.holder = who;
    return true;
  }

  /** Give the lease to `who` only if nobody holds it (auto-grant on connect). */
  offer(who: Holder): boolean {
    if (this.holder || who.role === "studio") return false;
    this.holder = who;
    return true;
  }

  /** The holder lets go, or disconnects. Returns true when the lease became free. */
  release(device: string): boolean {
    if (this.holder?.device !== device) return false;
    this.holder = null;
    return true;
  }

  canSend(device: string): boolean {
    return this.holder?.device === device;
  }
}
