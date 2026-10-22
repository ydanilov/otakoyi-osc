import { debugAddress, formatAgo, formatClock, formatRate, type DebugStore } from "@osc/controls";
import type { Pult } from "@osc/schema";
import type { OscLogLine } from "@osc/ui";
import type { SessionState } from "./session";

/** A label / value row (Figma `Debug Row`, Kind=Metric). */
export interface DebugMetric {
  label: string;
  value: string;
}

/** A control row (Figma `Debug Row`, Kind=Control). */
export interface DebugControlRow {
  id: string;
  label: string;
  /** OSC address or template. */
  address: string;
  /** Last value sent, or "—". */
  value: string;
  /** `12 msg/s`, or "—" when idle. */
  rate: string;
}

/** Everything the Debug page shows, section by section (Figma `20 Debug`). */
export interface DebugModel {
  connection: DebugMetric[];
  traffic: DebugMetric[];
  controls: DebugControlRow[];
  /** Newest first, at most 50. */
  log: OscLogLine[];
  versions: DebugMetric[];
}

const msgs = (r: number) => `${formatRate(r)} msg/s`;
/** A lone quoted string reads better without the quotes (`ambient`, not `"ambient"`). */
const unquote = (v: string) => (/^"[^"]*"$/.test(v) ? v.slice(1, -1) : v);

/** Every control on the pult, in page order. Unsupported controls send nothing: left out. */
export function controlRows(pult: Pult, debug: DebugStore): DebugControlRow[] {
  return pult.pages.flatMap((page) =>
    page.controls.flatMap((c) => {
      if (c.type === "unsupported") return [];
      const s = debug.control(c.id);
      const rate = s?.rate ?? 0;
      return [
        {
          id: c.id,
          label: c.label ?? c.id,
          address: debugAddress(c),
          value: s ? unquote(s.value) : "—",
          rate: rate > 0 ? msgs(rate) : "—",
        },
      ];
    }),
  );
}

/**
 * The Debug page's model from the session and its DebugStore. Pure: the page calls it four times
 * a second while it is open.
 */
export function debugModel(
  s: SessionState,
  debug: DebugStore,
  o: {
    device: string;
    bridge?: string | undefined;
    demo?: boolean;
    now: number;
    pult?: Pult | undefined;
  },
): DebugModel {
  const cfg = s.config;
  const r = debug.rates();
  const holder = s.lease;
  const inControl = holder
    ? `${holder.name ?? holder.device}${holder.device === o.device ? " (you)" : ""}${
        holder.role === "studio" ? " · studio" : ""
      }`
    : "Nobody";
  const targets = cfg?.targets ?? [];
  const t0 = targets[0];
  const target = t0
    ? `${t0.id} · ${t0.host}:${t0.port} ${t0.protocol.toUpperCase()}${
        targets.length > 1 ? ` +${targets.length - 1}` : ""
      }`
    : "—";
  // The bridge reports feedback times with its status; feedback that changed a value is newer.
  const fb = [...s.targets.map((t) => t.lastFeedbackAt), debug.lastIn].filter(
    (x): x is number => typeof x === "number",
  );
  const lastFeedback = fb.length ? Math.max(...fb) : null;
  const bridge = o.demo
    ? "Demo (in-app)"
    : (o.bridge?.replace(/^wss?:\/\//, "").replace(/\/ws$/, "") ?? "—");
  return {
    connection: [
      { label: "Bridge", value: bridge },
      { label: "Round trip", value: debug.rtt === null ? "—" : `${Math.round(debug.rtt)} ms` },
      { label: "Target", value: target },
      { label: "Last feedback", value: formatAgo(lastFeedback, o.now) },
      { label: "In control", value: inControl },
    ],
    traffic: [
      { label: "Sent", value: msgs(r.out) },
      { label: "Received", value: msgs(r.in) },
      { label: "Installation FPS", value: debug.fps === null ? "—" : debug.fps.toFixed(1) },
    ],
    controls: o.pult ? controlRows(o.pult, debug) : [],
    log: debug
      .entries()
      .slice(-50)
      .reverse()
      .map((e) => ({
        key: e.seq,
        time: formatClock(e.at),
        dir: e.dir,
        address: e.address,
        value: unquote(e.args),
      })),
    versions: [
      { label: "Protocol", value: s.protocol === null ? "—" : `v${s.protocol}` },
      { label: "Config revision", value: cfg ? String(cfg.installation.revision) : "—" },
      { label: "Schema", value: cfg ? String(cfg.schemaVersion) : "—" },
    ],
  };
}
