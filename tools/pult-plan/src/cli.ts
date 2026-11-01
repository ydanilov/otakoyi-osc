#!/usr/bin/env -S npx tsx
/**
 * pult-plan — OSC contract → screen plan / draft config; generated capacity table (ADR-017).
 *
 *   pult-plan plan --contract otakoyi/osc-contract.json [--form phone|tablet]
 *   pult-plan draft --contract otakoyi/osc-contract.json [--form phone|tablet] --out draft.json [--report r.md]
 *   pult-plan capacity [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseContract, type FormFactor, type OscContractDoc } from "@osc/schema";
import { capacityMarkdown } from "./capacity";
import { draftConfig, planContract, primaryForm, validateDraft } from "./plan";
import { formatDraftReport, formatPlan } from "./report";

const HELP = `pult-plan — OSC contract → pult screens

  pnpm pult-plan  --contract <path> [--form phone|tablet]
      prints which groups and controls land on which screen
  pnpm pult-draft --contract <path> [--form phone|tablet] [--out draft.json] [--report report.md]
      writes a draft config (validated by the app's parser) and a report
  pnpm pult-capacity [--check]
      regenerates docs/pult-capacity.md (--check: fail if it is stale)

--form defaults to the contract's use case: live → tablet, lobby / both → phone (ADR-013).
`;

const CWD = process.env.INIT_CWD ?? process.cwd();
const at = (p: string) => resolve(CWD, p);
const CAPACITY = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/pult-capacity.md");

function readContract(path: string): OscContractDoc {
  const r = parseContract(JSON.parse(readFileSync(at(path), "utf8")));
  if (!r.ok) throw new Error(`${path} is not a valid OSC contract:\n  ${r.errors.join("\n  ")}`);
  return r.contract;
}

function form(v: string | undefined, c: OscContractDoc): FormFactor {
  if (v === undefined) return primaryForm(c);
  if (v === "phone" || v === "tablet") return v;
  throw new Error(`--form must be phone or tablet, got "${v}"`);
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const { values: a } = parseArgs({
    args: rest,
    options: {
      contract: { type: "string" },
      form: { type: "string" },
      out: { type: "string" },
      report: { type: "string" },
      check: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (a.help || !cmd) {
    process.stdout.write(HELP);
    return a.help ? 0 : 2;
  }
  if (cmd === "capacity") {
    const md = capacityMarkdown();
    if (a.check) {
      let cur = "";
      try {
        cur = readFileSync(CAPACITY, "utf8");
      } catch {
        /* missing = stale */
      }
      if (cur !== md) {
        process.stderr.write("docs/pult-capacity.md is stale: run `pnpm pult-capacity`\n");
        return 1;
      }
      return 0;
    }
    writeFileSync(CAPACITY, md);
    process.stderr.write("wrote docs/pult-capacity.md\n");
    return 0;
  }
  if (!a.contract) {
    process.stderr.write(HELP);
    return 2;
  }
  const contract = readContract(a.contract);
  if (cmd === "plan") {
    process.stdout.write(formatPlan(planContract(contract, form(a.form, contract))));
    return 0;
  }
  if (cmd === "draft") {
    const d = draftConfig(contract, form(a.form, contract));
    const errors = validateDraft(d.config);
    const json = JSON.stringify(d.config, null, 2) + "\n";
    if (a.out) writeFileSync(at(a.out), json);
    else process.stdout.write(json);
    const report = formatDraftReport(d, errors);
    if (a.report) writeFileSync(at(a.report), report);
    else process.stderr.write(report);
    return errors.length ? 1 : 0;
  }
  process.stderr.write(HELP);
  return 2;
}

try {
  process.exit(main(process.argv.slice(2).filter((x, i) => !(i === 0 && x === "--"))));
} catch (e) {
  process.stderr.write(`pult-plan: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(2);
}
