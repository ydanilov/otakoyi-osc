/**
 * The bridge's core, free of sockets, files and Node APIs: shared pult state, the control lease,
 * installation actions, activity and prompt presets. `apps/bridge` runs it behind WebSocket, UDP /
 * TCP OSC and JSON files; `@osc/sim` runs the same core in-process for the demo installation.
 */
export * from "./bridge";
export * from "./lease";
export * from "./supervisor";
export * from "./prompts";
export * from "./images";
