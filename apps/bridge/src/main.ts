import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isSea } from "node:sea";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseConfig } from "@osc/schema";
import { ProcessSupervisor } from "./process-supervisor";
import { startServer } from "./server";

/**
 * Defaults. From the repo (pnpm bridge): the demo config, apps/mobile/dist, apps/bridge/{logs,data}.
 * As the single binary (Node SEA, `build:bin`): everything next to the executable —
 * installation.json, web/, logs/, data/.
 */
function defaults() {
  if (isSea()) {
    const dir = dirname(process.execPath);
    return {
      config: resolve(dir, "installation.json"),
      web: resolve(dir, "web"),
      logs: resolve(dir, "logs"),
      data: resolve(dir, "data"),
    };
  }
  const here =
    typeof __filename !== "undefined"
      ? dirname(__filename)
      : dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, "../../..");
  return {
    config: resolve(repo, "design-system/packages/schema/examples/demo-installation.json"),
    web: resolve(repo, "apps/mobile/dist"),
    logs: resolve(repo, "apps/bridge/logs"),
    data: resolve(repo, "apps/bridge/data"),
  };
}

async function main() {
  const d = defaults();
  const { values } = parseArgs({
    options: {
      config: { type: "string", default: d.config },
      port: { type: "string", default: "8080" },
      host: { type: "string", default: "0.0.0.0" },
      web: { type: "string", default: d.web },
      assets: { type: "string" },
      logs: { type: "string", default: d.logs },
      data: { type: "string", default: d.data },
    },
  });

  const raw = JSON.parse(await readFile(values.config, "utf8"));
  const parsed = parseConfig(raw);
  if (!parsed.ok) {
    console.error("[bridge] config is not valid:", parsed);
    process.exit(1);
  }
  const config = parsed.config;

  const pin = process.env.OTAKOYI_PIN || undefined;
  if (!pin)
    console.warn(
      "[bridge] OTAKOYI_PIN is not set: any device on the network can connect (dev only)",
    );

  // Otakoyi Runtime (ADR-011): start and watch the installation software when the config says how.
  const supervised = config.targets.filter((t) => t.runtime);
  const supervisor =
    supervised.length && process.env.OTAKOYI_SUPERVISE !== "0"
      ? new ProcessSupervisor({
          runtimeDir: dirname(resolve(values.config)),
          launch: (command, args, opts) =>
            spawn(command, args, { ...opts, stdio: "ignore", windowsHide: false }),
          onEvent: (e) => console.log("[supervisor]", JSON.stringify(e)),
        })
      : undefined;

  const server = await startServer({
    config,
    port: Number(values.port),
    host: values.host,
    webDir: values.web,
    assetsDir: values.assets ?? resolve(dirname(resolve(values.config)), "assets"),
    logDir: values.logs,
    dataDir: values.data,
    debug: process.env.OTAKOYI_DEBUG === "1",
    auth: { clientPin: pin, studioKey: process.env.OTAKOYI_STUDIO_KEY || undefined },
    supervisor,
  });
  for (const t of supervised) if (supervisor) await supervisor.start(t);

  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, () => {
      void (supervisor?.stopAll() ?? Promise.resolve())
        .then(() => server.close())
        .then(() => process.exit(0));
    });
}

void main().catch((e: unknown) => {
  console.error("[bridge]", e);
  process.exit(1);
});
