#!/usr/bin/env -S npx tsx
/**
 * figma-export — Figma client page → installation config (ADR-014). See docs/figma-export.md.
 *
 *   figma-export --file <key> --page "Client · Phase One" [--section Phone] --out config.json
 *   figma-export --snapshot fixtures/phase-one.json --out config.json --report report.md
 */
import { readFileSync, writeFileSync as write } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { exportSnapshot, type BaseConfig, type OscContract } from "./export";
import { formatReport } from "./report";
import { fetchSnapshot } from "./rest";
import { isSnapshot, type Snapshot } from "./snapshot";

const HELP = `figma-export — Figma client page → installation config

Input (one of):
  --file <key> --page <name|id>   read the page through the Figma REST API (FIGMA_ACCESS_TOKEN)
  --snapshot <path>               read a saved snapshot (offline, tests, CI)

Options:
  --section <name|id>     only frames in matching sections (e.g. Phone)
  --base <path>           installation, targets, theme, presets, pult id/name (not in Figma)
  --contract <path>       installation OSC contract; unknown addresses are errors
  --previous <path>       published config; revision is bumped when the pults changed
  --out <path>            config output (default: stdout)
  --report <path>         Markdown report (default: stderr)
  --report-json <path>    report as JSON (issues + summary)
  --save-snapshot <path>  save the fetched snapshot (REST mode)
  --allow-gaps            exit 0 even with errors (the config is always written if it validates)
`;

/** pnpm runs scripts in the package folder; paths are relative to where the command was typed. */
const CWD = process.env.INIT_CWD ?? process.cwd();
const at = (p: string) => resolve(CWD, p);
const writeFileSync = (p: string, data: string) => write(at(p), data);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(at(path), "utf8"));
}

async function main(argv: string[]): Promise<number> {
  const { values: a } = parseArgs({
    args: argv,
    options: {
      file: { type: "string" },
      page: { type: "string" },
      snapshot: { type: "string" },
      section: { type: "string" },
      base: { type: "string" },
      contract: { type: "string" },
      previous: { type: "string" },
      out: { type: "string" },
      report: { type: "string" },
      "report-json": { type: "string" },
      "save-snapshot": { type: "string" },
      "allow-gaps": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (a.help) {
    process.stdout.write(HELP);
    return 0;
  }

  let snap: Snapshot;
  if (a.snapshot) {
    const s = readJson(a.snapshot);
    if (!isSnapshot(s)) throw new Error(`${a.snapshot} is not an otakoyi-figma-snapshot v1`);
    snap = s;
  } else if (a.file && a.page) {
    const token = process.env.FIGMA_ACCESS_TOKEN;
    if (!token) throw new Error("FIGMA_ACCESS_TOKEN is not set");
    snap = await fetchSnapshot({ fileKey: a.file, page: a.page, token });
    if (a["save-snapshot"]) writeFileSync(a["save-snapshot"], JSON.stringify(snap, null, 2) + "\n");
  } else {
    process.stderr.write(HELP);
    return 2;
  }

  const result = exportSnapshot(snap, {
    section: a.section,
    base: a.base ? (readJson(a.base) as BaseConfig) : undefined,
    contract: a.contract ? (readJson(a.contract) as OscContract) : undefined,
    previous: a.previous ? (readJson(a.previous) as never) : undefined,
  });

  const json = JSON.stringify(result.config, null, 2) + "\n";
  if (a.out) writeFileSync(a.out, json);
  else process.stdout.write(json);
  const report = formatReport(result);
  if (a.report) writeFileSync(a.report, report);
  else process.stderr.write(report);
  if (a["report-json"])
    writeFileSync(
      a["report-json"],
      JSON.stringify(
        { valid: result.valid, summary: result.summary, issues: result.issues },
        null,
        2,
      ) + "\n",
    );

  if (!result.valid) return 1;
  const errors = result.issues.filter((i) => i.level === "error").length;
  return errors && !a["allow-gaps"] ? 1 : 0;
}

main(process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--"))).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`figma-export: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  },
);
