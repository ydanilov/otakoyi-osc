import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseConfig } from "@osc/schema";
import { startServer } from "./server";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");

const { values } = parseArgs({
  options: {
    config: {
      type: "string",
      default: resolve(repo, "packages/schema/examples/demo-installation.json"),
    },
    port: { type: "string", default: "8080" },
    host: { type: "string", default: "0.0.0.0" },
    web: { type: "string", default: resolve(repo, "apps/mobile/dist") },
    logs: { type: "string", default: resolve(repo, "apps/bridge/logs") },
  },
});

const raw = JSON.parse(await readFile(values.config, "utf8"));
const parsed = parseConfig(raw);
if (!parsed.ok) {
  console.error("[bridge] config is not valid:", parsed);
  process.exit(1);
}

const pin = process.env.OTAKOYI_PIN || undefined;
if (!pin)
  console.warn("[bridge] OTAKOYI_PIN is not set: any device on the network can connect (dev only)");

const server = await startServer({
  config: parsed.config,
  port: Number(values.port),
  host: values.host,
  webDir: values.web,
  logDir: values.logs,
  debug: process.env.OTAKOYI_DEBUG === "1",
  auth: { clientPin: pin, studioKey: process.env.OTAKOYI_STUDIO_KEY || undefined },
});

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    void server.close().then(() => process.exit(0));
  });
