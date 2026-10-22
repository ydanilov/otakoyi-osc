import { parseConfig, type InstallationConfig } from "@osc/schema";
import { Simulator } from "@osc/sim";
import demoJson from "../../../../packages/schema/examples/try-the-demo.json";
import { Session } from "./session";

const parsed = parseConfig(demoJson);
if (!parsed.ok) throw new Error("Demo config is invalid");
export const demoConfig: InstallationConfig = parsed.config;

/** The demo's assets, bundled with the app (`theme.logo` / `theme.splash`, picture pad images). */
export const DEMO_ASSETS: Readonly<Record<string, number>> = {
  "demo-logo.png": require("../../../../packages/schema/examples/assets/demo-logo.png"),
  "demo-splash.jpg": require("../../../../packages/schema/examples/assets/demo-splash.jpg"),
  "demo-pad.jpg": require("../../../../packages/schema/examples/assets/demo-pad.jpg"),
};

/**
 * "Try the demo" (ADR-012) — the installation of the Figma page "Demo · Try the demo"
 * (`packages/schema/examples/try-the-demo.json`): VJ console (tablet), Lighting cues, Lobby wall
 * (phone): a simulated installation inside the app — the same bridge core and
 * protocol as a real one (`@osc/sim`), with the demo config. App Review and prospective clients
 * use it; nothing leaves the device.
 */
export async function createDemoSession(
  device: string,
): Promise<{ session: Session; sim: Simulator }> {
  const sim = new Simulator({ config: demoConfig });
  await sim.seedPrompts();
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
