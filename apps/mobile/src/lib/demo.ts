import { parseConfig, type InstallationConfig } from "@osc/schema";
import { Simulator } from "@osc/sim";
import demoJson from "../../../../packages/schema/examples/demo-installation.json";
import { Session } from "./session";

const parsed = parseConfig(demoJson);
if (!parsed.ok) throw new Error("Demo config is invalid");
export const demoConfig: InstallationConfig = parsed.config;

/** The demo's brand assets, bundled with the app (relative paths of `theme.logo` / `theme.splash`). */
export const DEMO_ASSETS: Readonly<Record<string, number>> = {
  "demo-logo.png": require("../../../../packages/schema/examples/assets/demo-logo.png"),
  "demo-splash.jpg": require("../../../../packages/schema/examples/assets/demo-splash.jpg"),
};

/**
 * "Try the demo" (ADR-012): a simulated installation inside the app — the same bridge core and
 * protocol as a real one (`@osc/sim`), with the demo config. App Review and prospective clients
 * use it; nothing leaves the device.
 */
export function createDemoSession(device: string): { session: Session; sim: Simulator } {
  const sim = new Simulator({ config: demoConfig });
  sim.start();
  const session = new Session({
    kind: "demo",
    name: demoConfig.installation.name,
    device,
    transport: sim.transport,
    http: sim.http(device),
  });
  return { session, sim };
}
