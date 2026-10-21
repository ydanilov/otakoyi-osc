import { argValue, message, type OscMessage } from "@osc/core";
import { parseConfig, type InstallationConfig } from "@osc/schema";
import type { PultStore, Transport } from "@osc/ui";
import demoJson from "../../../../packages/schema/examples/demo-installation.json";

const parsed = parseConfig(demoJson);
if (!parsed.ok) throw new Error("Demo config is invalid");
export const demoConfig: InstallationConfig = parsed.config;

/**
 * Demo mode: no installation needed. Used before login and by App Review.
 * Echoes sent values back as feedback and simulates FPS and an audio meter,
 * so every control visibly works without a network.
 */
export function createDemoTransport(
  getStore: () => PultStore | null,
): Transport & { start(): () => void } {
  return {
    send(_target, msgs: OscMessage[]) {
      if (__DEV__) for (const m of msgs) console.log("[osc:demo]", m.address, m.args.map(argValue));
    },
    start() {
      let t = 0;
      const id = setInterval(() => {
        const store = getStore();
        if (!store) return;
        t += 1;
        const level =
          0.35 + 0.3 * Math.abs(Math.sin(t / 7)) + 0.35 * Math.max(0, Math.sin(t / 3.1)) ** 8;
        store.receive(message("/wall/audio/level", Math.min(1, level)));
        if (t % 10 === 0)
          store.receive(message("/sys/fps", 58 + Math.round(Math.random() * 20) / 10));
      }, 100);
      return () => clearInterval(id);
    },
  };
}
