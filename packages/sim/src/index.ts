/**
 * `@osc/sim` — the demo installation, simulated in-process (ADR-012 "Try the demo"). Same bridge
 * core and protocol as `apps/bridge`; platform-agnostic, no sockets or files.
 */
export * from "./simulator";
export * from "./preview";
export * from "./bindings";
