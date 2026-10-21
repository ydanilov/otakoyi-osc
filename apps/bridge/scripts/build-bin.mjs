#!/usr/bin/env node
/**
 * Single-binary bridge with Node SEA (single executable application), for Otakoyi Runtime
 * (ADR-011). Produces dist/bin/otakoyi-bridge[.exe] for the OS and CPU it runs on — build on
 * Windows for Windows and on macOS for macOS (Node SEA cannot cross-build).
 *
 *   pnpm --filter @osc/bridge build:bin            # binary only
 *   pnpm --filter @osc/bridge build:bin --web      # + the web pult (apps/mobile/dist → web/)
 *
 * The binary looks for installation.json, web/, logs/ and data/ next to itself (see main.ts).
 * Code signing and installers are out of scope: on macOS the binary is ad-hoc signed only.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const { inject } = require("postject");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "bin");
const win = process.platform === "win32";
const mac = process.platform === "darwin";
const exe = join(out, win ? "otakoyi-bridge.exe" : "otakoyi-bridge");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

const [major] = process.versions.node.split(".").map(Number);
if (major < 22) throw new Error(`Node 22+ is needed for SEA (this is ${process.version})`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. One CommonJS file (SEA runs CommonJS). ws' optional native add-ons stay out: it falls back to JS.
const bundle = join(out, "bridge.cjs");
esbuild.buildSync({
  entryPoints: [join(root, "src/main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: bundle,
  external: ["bufferutil", "utf-8-validate"],
  // main.ts reads import.meta.url only outside SEA (from the repo); the binary never gets there.
  logOverride: { "empty-import-meta": "silent" },
  logLevel: "warning",
});

// 2. SEA blob.
const blob = join(out, "sea-prep.blob");
const seaConfig = join(out, "sea-config.json");
writeFileSync(
  seaConfig,
  JSON.stringify({
    main: bundle,
    output: blob,
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
  }),
);
run(process.execPath, ["--experimental-sea-config", seaConfig]);

// 3. Copy this node binary and inject the blob.
copyFileSync(process.execPath, exe);
chmodSync(exe, 0o755);
if (mac) run("codesign", ["--remove-signature", exe]);
await inject(exe, "NODE_SEA_BLOB", readFileSync(blob), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ...(mac ? { machoSegmentName: "NODE_SEA" } : {}),
});
if (mac) run("codesign", ["--sign", "-", exe]);

for (const f of [bundle, blob, seaConfig]) rmSync(f);

// 4. Optional: the web pult next to it.
if (process.argv.includes("--web")) {
  const web = resolve(root, "../mobile/dist");
  if (!existsSync(web))
    throw new Error("Build the web pult first: pnpm --filter @osc/mobile build:web");
  cpSync(web, join(out, "web"), { recursive: true });
}
console.log(`\nbuilt ${exe}`);
