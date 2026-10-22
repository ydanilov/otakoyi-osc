/** Human-readable report of an export (Markdown, so it reads well in a PR). */
import type { ExportResult } from "./export";
import type { Level } from "./mapping";

const HEADINGS: Record<Level, string> = { error: "Errors", warning: "Warnings", info: "Notes" };

export function formatReport(r: ExportResult): string {
  const s = r.summary;
  const lines: string[] = [];
  lines.push(`# Figma export — ${s.page}${s.fileKey ? ` (${s.fileKey})` : ""}`, "");
  const count = (l: Level) => r.issues.filter((i) => i.level === l).length;
  lines.push(
    `Schema: **${r.valid ? "valid" : "INVALID"}** · pult \`${s.pultId}\` · ${s.pages.length} pages · ${s.controls} controls · ${count("error")} errors · ${count("warning")} warnings · ${count("info")} notes · ${s.screensSkipped} screens skipped`,
    "",
  );
  lines.push(
    "| Page | Title | Phone frame | Tablet frame | Controls |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const p of s.pages)
    lines.push(
      `| \`${p.id}\` | ${p.title} | ${p.frames.phone ? `${p.frames.phone.name} (${p.frames.phone.id})` : "—"} | ${p.frames.tablet ? `${p.frames.tablet.name} (${p.frames.tablet.id})` : "—"} | ${p.controls} |`,
    );
  for (const level of ["error", "warning", "info"] as Level[]) {
    const list = r.issues.filter((i) => i.level === level);
    if (!list.length) continue;
    lines.push("", `## ${HEADINGS[level]} (${list.length})`, "");
    for (const i of list)
      lines.push(
        `- \`${i.code}\`${i.where ? ` ${i.where}` : ""} — ${i.message}${i.nodeId ? ` [${i.nodeId}]` : ""}`,
      );
  }
  return lines.join("\n") + "\n";
}
