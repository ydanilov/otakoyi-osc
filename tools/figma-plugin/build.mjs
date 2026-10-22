// Bundles src/code.ts (and the exporter mapping it imports) into dist/code.js for Figma.
import { build } from "esbuild";

/** @param {{ write?: boolean }} [opts] */
export async function buildPlugin(opts = {}) {
  return build({
    entryPoints: [new URL("./src/code.ts", import.meta.url).pathname],
    bundle: true,
    format: "iife",
    target: "es2020",
    platform: "browser",
    outfile: new URL("./dist/code.js", import.meta.url).pathname,
    write: opts.write ?? true,
    logLevel: opts.write === false ? "silent" : "info",
    legalComments: "none",
    minify: true,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await buildPlugin();
