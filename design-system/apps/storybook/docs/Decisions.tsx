/// <reference types="vite/client" />
import * as React from "react";

/**
 * The repo's decision records, read at build time from docs/decisions (so this page never drifts
 * from them). Shows each decision's title and status and links to the full text on GitHub.
 */
const files = import.meta.glob("../../../../docs/decisions/0*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const REPO = "https://github.com/ydanilov/otakoyi-osc/blob/main/docs/decisions/";

interface Decision {
  file: string;
  title: string;
  status: string;
  superseded: boolean;
}

function parse(path: string, text: string): Decision {
  const file = path.split("/").pop()!;
  const heading = text.match(/^#\s+(.+)$/m)?.[1] ?? file;
  const title = heading.replace(/^\d+\s*[—-]\s*/, "");
  const superseded = /superseded by/i.test(text.slice(0, 400));
  const status = (text.match(/\*\*Status:\*\*\s*([^\n·]+)/)?.[1] ?? "").trim();
  return { file, title, status: superseded ? "Superseded" : status, superseded };
}

export function DecisionList() {
  const list = Object.entries(files)
    .map(([p, t]) => parse(p, t))
    .sort((a, b) => a.file.localeCompare(b.file));
  if (!list.length) return <p>No decision records found next to this design system.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Decision</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {list.map((d) => (
          <tr key={d.file} style={d.superseded ? { opacity: 0.55 } : undefined}>
            <td>
              <a href={REPO + d.file} target="_blank" rel="noreferrer">
                {d.title}
              </a>
            </td>
            <td>{d.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
