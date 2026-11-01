import type { DraftResult, Plan, PlannedPage } from "./plan";
import { REFERENCE } from "./plan";
import type { MapIssue } from "./controls";

const describe = (page: PlannedPage) =>
  page.controls.map((c) => `${c.control.label ?? c.control.id} (${c.control.type})`).join(", ");

function issuesBlock(issues: MapIssue[]): string[] {
  if (!issues.length) return ["No issues."];
  const order = { warning: 0, info: 1 } as const;
  return [...issues]
    .sort((a, b) => order[a.level] - order[b.level])
    .map((i) => `- **${i.level}** \`${i.code}\`: ${i.message}`);
}

/** `pnpm pult-plan`: which groups and controls land on which screen. */
export function formatPlan(plan: Plan): string {
  const r = REFERENCE[plan.form];
  const L = [`# Pult plan — ${plan.form} (${r.width} × ${r.height} pt, ${r.device})`, ""];
  const section = (title: string, pages: PlannedPage[]) => {
    if (!pages.length) return;
    L.push(`## ${title}`, "");
    pages.forEach((p, i) => {
      L.push(`${i + 1}. **${p.title}** [${p.priority}] — ${p.controls.length} controls`);
      L.push(`   ${describe(p)}`);
    });
    L.push("");
  };
  section("Main pult", plan.main);
  section("Setup pult", plan.setup);
  if (plan.otherOnly.length) {
    L.push(`## Not on ${plan.form}`, "");
    L.push(plan.otherOnly.map((d) => d.param.address).join(", "), "");
  }
  L.push("## Issues", "", ...issuesBlock(plan.issues), "");
  return L.join("\n");
}

/** Report next to `pnpm pult-draft`'s config. */
export function formatDraftReport(d: DraftResult, errors: string[]): string {
  const L = [`# Draft pult — primary ${d.plan.form}`, ""];
  L.push(
    "Draft from the OSC contract (ADR-017). The final pult is designed in Figma (ADR-014); use this config to test against the bridge and as the starting point for the Figma page.",
    "",
  );
  L.push("| Pult | Page | Phone screens | Tablet screens |", "| --- | --- | --- | --- |");
  for (const s of d.screens) L.push(`| ${s.pult} | ${s.page} | ${s.phone} | ${s.tablet} |`);
  L.push("");
  if (errors.length) L.push("## Config errors", "", ...errors.map((e) => `- ${e}`), "");
  L.push("## Issues", "", ...issuesBlock(d.issues), "");
  return L.join("\n");
}
