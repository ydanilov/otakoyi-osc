/**
 * The two build annotations the studio adds to control instances on a client page (ADR-014):
 *
 * - **OSC** — what the control sends. Canonical form (what the Otakoyi Inspector writes):
 *
 *   (bold address) `float 0–1` · absolute · 60 Hz · feedback ✓ · default=0.6
 *
 *   e.g. a bold `/wall/brightness` followed by that spec (see docs/figma-export.md).
 *   One or more addresses in bold, each followed by its own spec in backticks (type, range,
 *   values or quoted options), then shared keywords separated by `·`. The parser is lenient:
 *   prose around the tokens is ignored, so annotations written by hand still parse.
 *
 * - **Depends on** — when the control is usable. Lines of the form `when <control-id> = <value>`
 *   (or `is on` / `is off`) become `enabledWhen` conditions; anything else is a note for people and
 *   is listed in the report.
 */

export type OscValue = number | string;

/** One address of an OSC annotation and the spec written next to it. */
export interface AddressSpec {
  /** As written, e.g. `/mix/layer/{1–4}/opacity` or `/fx/shape/{knob-id}`. */
  address: string;
  type?: "float" | "int" | "string" | "bool";
  /** `x y float` — two values per message. */
  pair?: boolean;
  range?: [number, number];
  /** Quoted options: `"ambient" | "react" | "show"`. */
  options?: string[];
  /** Numeric alternatives: `1 | 0` (on, off). A single number: the value sent. */
  values?: number[];
  /** `float×4` — number of values (bands). */
  count?: number;
}

export interface OscSpec {
  entries: AddressSpec[];
  rateHz?: number;
  mode?: "absolute" | "relative";
  /** `feedback ✓`: the installation echoes the value on the same address. */
  feedback?: boolean;
  springBack?: boolean;
  /** `crossfade` mentioned; seconds from `crossfade=<s>` when given. */
  crossfade?: boolean | number;
  /** Degrees of knob travel, e.g. `240°`. */
  degrees?: number;
  multiSelect?: boolean;
  /** The annotation says it is a draft (to confirm against the OSC contract). */
  draft: boolean;
  /** `key=value` pairs: min, max, step, curve, default, target, lock, studio, … */
  keys: Record<string, string>;
}

export interface DependsOn {
  conditions: { control: string; equals: number | string }[];
  /** Prose that is not a condition (for people; listed in the report). */
  notes: string[];
}

const ADDRESS_CHARS = String.raw`[^\s*\x60,;()<>"'·]+`;
const RANGE = /(-?\d+(?:\.\d+)?)\s*(?:–|—|…|\.\.\.?|to|-)\s*(-?\d+(?:\.\d+)?)/;

/** Markdown and entities Figma puts in `labelMarkdown`, normalised for parsing. */
export function plain(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/−/g, "-");
}

function cleanAddress(a: string): string {
  return a.replace(/[.,:;]+$/, "");
}

/** Addresses with their positions: bold ones if any are bold, else every `/…` token. */
function findAddresses(text: string): { address: string; start: number; end: number }[] {
  const bold = [...text.matchAll(/\*\*\s*(\/[^*]+?)\s*\*\*/g)].map((m) => ({
    address: cleanAddress(m[1]!.trim()),
    start: m.index!,
    end: m.index! + m[0].length,
  }));
  if (bold.length) return bold;
  const re = new RegExp(String.raw`(^|[\s\x60(])(\/${ADDRESS_CHARS})`, "g");
  return [...text.matchAll(re)].map((m) => {
    const start = m.index! + m[1]!.length;
    return { address: cleanAddress(m[2]!), start, end: start + m[2]!.length };
  });
}

function parseEntrySpec(address: string, seg: string): AddressSpec {
  const e: AddressSpec = { address };
  const type = /\b(float|int|string|bool)\b/.exec(seg);
  if (type) e.type = type[1] as AddressSpec["type"];
  if (/\bx\s*y\b/i.test(seg)) e.pair = true;
  const options = [...seg.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (options.length) e.options = options;
  const alt = /(?:^|[\s\x60])(-?\d+(?:\.\d+)?(?:\s*\|\s*-?\d+(?:\.\d+)?)+)(?=[\s\x60]|$)/.exec(seg);
  if (alt) e.values = alt[1]!.split("|").map((v) => Number(v.trim()));
  else {
    const single = /\x60\s*(-?\d+(?:\.\d+)?)\s*\x60/.exec(seg);
    if (single) e.values = [Number(single[1])];
  }
  const range = RANGE.exec(seg);
  if (range) e.range = [Number(range[1]), Number(range[2])];
  const count = /\b(?:float|int|string|bool)\s*[×x]\s*(\d+)\b/.exec(seg);
  if (count) e.count = Number(count[1]);
  return e;
}

/** Parse an OSC annotation (one or several, joined by newlines). */
export function parseOsc(raw: string): OscSpec {
  const text = plain(raw);
  const spec: OscSpec = { entries: [], draft: /\bdraft\b/i.test(text), keys: {} };
  // The "draft — confirm against …" line is a note for people, not part of the spec.
  const body = text
    .split("\n")
    .filter((l) => !/^\s*[*_]?\s*draft\b/i.test(l))
    .join("\n");

  const found = findAddresses(body);
  found.forEach((f, i) => {
    const seg = body.slice(f.end, found[i + 1]?.start ?? body.length);
    spec.entries.push(parseEntrySpec(f.address, seg));
  });
  // A comma list shares the spec written after its last address: `/a, /b → 1 | 0`.
  for (let i = spec.entries.length - 2; i >= 0; i--) {
    const e = spec.entries[i]!;
    const next = spec.entries[i + 1]!;
    if (!e.type && !e.values && !e.options && !e.range) {
      if (next.type) e.type = next.type;
      if (next.values) e.values = next.values;
      if (next.range) e.range = next.range;
    }
  }

  let rest = body;
  for (const f of [...found].reverse()) rest = rest.slice(0, f.start) + " " + rest.slice(f.end);
  for (const m of rest.matchAll(/\b([a-zA-Z][\w-]*)\s*=\s*([^\s·,]+)/g)) spec.keys[m[1]!] = m[2]!;
  const rate = /(\d+(?:\.\d+)?)\s*Hz\b/i.exec(rest);
  if (rate) spec.rateHz = Number(rate[1]);
  if (/\brelative\b/i.test(rest)) spec.mode = "relative";
  else if (/\babsolute\b/i.test(rest)) spec.mode = "absolute";
  if (/feedback\s*(✓|✔|yes|on)/i.test(rest)) spec.feedback = true;
  if (/springs?\s+back/i.test(rest)) spec.springBack = true;
  if (/multi-?select/i.test(rest)) spec.multiSelect = true;
  const deg = /(\d+)\s*°/.exec(rest);
  if (deg) spec.degrees = Number(deg[1]);
  if (spec.keys.crossfade !== undefined && Number.isFinite(Number(spec.keys.crossfade)))
    spec.crossfade = Number(spec.keys.crossfade);
  else if (/\bcrossfade\b/i.test(rest)) spec.crossfade = true;
  return spec;
}

/** Parse a "Depends on" annotation. */
export function parseDependsOn(raw: string): DependsOn {
  const out: DependsOn = { conditions: [], notes: [] };
  for (const line of plain(raw).split("\n")) {
    const l = line.replace(/[*_\x60]/g, "").trim();
    if (!l) continue;
    const m = /^when\s+([a-z0-9][a-z0-9_-]*)\s*(?:=|==|is)\s*(.+?)\.?$/i.exec(l);
    if (m) {
      const v = m[2]!.trim();
      const equals =
        /^on$/i.test(v) || /^true$/i.test(v)
          ? 1
          : /^off$/i.test(v) || /^false$/i.test(v)
            ? 0
            : Number.isFinite(Number(v))
              ? Number(v)
              : v.replace(/^"|"$/g, "");
      out.conditions.push({ control: m[1]!, equals });
    } else out.notes.push(l);
  }
  return out;
}

/** Expand `{a–b}` index ranges in an address template; other placeholders are kept. */
export function expandRange(address: string): string[] | undefined {
  const m = /\{(\d+)\s*(?:–|-|…|\.\.)\s*(\d+)\}/.exec(plain(address));
  if (!m) return undefined;
  const [from, to] = [Number(m[1]), Number(m[2])];
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(plain(address).replace(m[0], String(i)));
  return out;
}

/** Placeholder like `{knob-id}`, `{id}`, `{name}`: filled with the control (or button) id. */
export const ID_PLACEHOLDER = /\{(?:[a-z]+-)?(?:id|name)\}/i;

/** Format a spec back into the canonical annotation text (used by the Inspector). */
export function formatOsc(e: {
  address: string;
  type?: string;
  range?: [number, number];
  values?: number[];
  options?: string[];
  keywords?: string[];
}): string {
  const code: string[] = [];
  if (e.options?.length) code.push(e.options.map((o) => `"${o}"`).join(" | "));
  else if (e.values?.length) code.push(e.values.join(" | "));
  else {
    const t = [e.type, e.range ? `${e.range[0]}–${e.range[1]}` : undefined].filter(Boolean);
    if (t.length) code.push(t.join(" "));
  }
  return [`**${e.address}**${code.length ? ` \`${code[0]}\`` : ""}`, ...(e.keywords ?? [])].join(
    " · ",
  );
}
