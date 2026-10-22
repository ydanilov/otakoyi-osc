import { formatAgo, formatClock, formatRate, type DebugStore } from "@osc/controls";
import type { DebugHudLogLine, DebugHudMetric } from "@osc/ui";
import type { SessionState } from "./session";

/**
 * What the debug HUD shows (Figma `Debug HUD`), from the session and its DebugStore. Pure: the
 * HUD calls it a few times a second.
 */
export function hudModel(
  s: SessionState,
  debug: DebugStore,
  o: { device: string; bridge?: string | undefined; demo?: boolean; now: number },
): { versions: string; metrics: DebugHudMetric[]; log: DebugHudLogLine[] } {
  const cfg = s.config;
  const r = debug.rates();
  const holder = s.lease;
  const lease = holder
    ? `${holder.name ?? holder.device}${holder.device === o.device ? " · you" : ""}${
        holder.role === "studio" ? " · studio" : ""
      }`
    : "none";
  const targets = cfg?.targets ?? [];
  const t0 = targets[0];
  const target = t0
    ? `${t0.id} ${t0.host}:${t0.port} ${t0.protocol}${targets.length > 1 ? ` +${targets.length - 1}` : ""}`
    : "—";
  // The bridge reports feedback times with its status; feedback that changed a value is newer.
  const fb = [...s.targets.map((t) => t.lastFeedbackAt), debug.lastIn].filter(
    (x): x is number => typeof x === "number",
  );
  const lastFeedback = fb.length ? Math.max(...fb) : null;
  return {
    versions: [
      `proto v${s.protocol ?? "?"}`,
      `rev ${cfg?.installation.revision ?? "?"}`,
      `schema ${cfg?.schemaVersion ?? "?"}`,
    ].join(" · "),
    metrics: [
      {
        label: "bridge",
        value: o.demo ? "demo (in-app)" : (o.bridge?.replace(/\/ws$/, "") ?? "—"),
      },
      { label: "rtt", value: debug.rtt === null ? "—" : `${Math.round(debug.rtt)} ms` },
      { label: "out", value: `${formatRate(r.out)} msg/s` },
      { label: "in", value: `${formatRate(r.in)} msg/s` },
      { label: "fps", value: debug.fps === null ? "—" : debug.fps.toFixed(1) },
      { label: "lease", value: lease },
      { label: "target", value: target },
      { label: "feedback", value: formatAgo(lastFeedback, o.now) },
    ],
    log: debug.entries().map((e) => ({
      key: e.seq,
      time: formatClock(e.at),
      dir: e.dir,
      text: `${e.address} ${e.args}`.trim(),
    })),
  };
}
