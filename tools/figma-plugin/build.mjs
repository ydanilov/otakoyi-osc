// Bundles src/code.ts (and the exporter mapping it imports) into dist/code.js for Figma.
// Figma's plugin sandbox is older than modern browsers: target ES2017 and rewrite BigInt literals
// (zod's int64 limits) into guarded BigInt() calls so the bundle parses and loads.
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const outfile = new URL("./dist/code.js", import.meta.url).pathname;

/** Turns `123n` literals into calls that also survive a sandbox without BigInt. */
export function rewriteBigIntLiterals(code) {
  return code.replace(
    /(^|[^\w$."'`])(-?)(\d+)n(?![\w$])/g,
    (_m, pre, sign, digits) =>
      `${pre}(typeof BigInt=="function"?BigInt("${sign}${digits}"):${sign}${digits})`,
  );
}

/** @param {{ write?: boolean }} [opts] */
export async function buildPlugin(opts = {}) {
  const write = opts.write ?? true;
  const result = await build({
    entryPoints: [new URL("./src/code.ts", import.meta.url).pathname],
    bundle: true,
    format: "iife",
    target: "es2017",
    supported: { bigint: true },
    platform: "browser",
    outfile,
    write: false,
    logLevel: write ? "info" : "silent",
    legalComments: "none",
    minify: true,
  });
  const code = rewriteBigIntLiterals(result.outputFiles[0].text);
  if (write) await writeFile(outfile, code);
  return { ...result, code };
}

if (import.meta.url === `file://${process.argv[1]}`) await buildPlugin();
