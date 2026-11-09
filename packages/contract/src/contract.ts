/**
 * The installation's OSC contract (`otakoyi/osc-contract.json` in the installation repo). The JSON
 * Schema in `docs/osc-contract.schema.json` is the published format; this zod mirror is what the
 * repo's tools read (pult-draft, pult-plan, the exporter's contract check). `contract.test.ts`
 * keeps the two in sync.
 */
import { z } from "zod";

/** Contract versions this repo reads. 1.1 adds `priority`, `order` and `formFactors`. */
export const CONTRACT_VERSIONS = [1, 1.1] as const;
export const CONTRACT_VERSION = 1.1;

export const PARAMETER_PRIORITIES = ["live", "tune", "setup", "hidden"] as const;
export type ParameterPriority = (typeof PARAMETER_PRIORITIES)[number];

export const PARAMETER_TYPES = [
  "float",
  "int",
  "bool",
  "trigger",
  "enum",
  "xy",
  "color",
  "string",
] as const;
export type ParameterType = (typeof PARAMETER_TYPES)[number];

const RESERVED = /^\/(otakoyi|sys)(\/|$)/;
const contractAddress = z
  .string()
  .regex(
    /^\/([^\s#*,?[\]{}]|\{(index|row|col)\})*$/,
    "OSC address (placeholders {index} {row} {col})",
  )
  .refine((a) => !RESERVED.test(a), "/otakoyi/* and /sys/* are reserved");
const value = z.union([z.number(), z.string(), z.boolean(), z.null()]);
const port = z.number().int().min(1).max(65535);

export const ContractParameter = z
  .object({
    address: contractAddress,
    type: z.enum(PARAMETER_TYPES),
    label: z.string().min(1),
    description: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    default: value.optional(),
    unit: z.string().optional(),
    curve: z.enum(["linear", "log", "exp"]).optional(),
    options: z.array(z.object({ value, label: z.string() }).loose()).optional(),
    count: z.number().int().min(1).optional(),
    colorFormat: z.enum(["hsb", "rgbFloat", "rgbInt", "hsvFloat", "hex"]).optional(),
    hueRange: z.enum(["degrees", "unit"]).optional(),
    feedback: z.boolean().optional(),
    dangerous: z.boolean().optional(),
    hint: z.string().optional(),
    group: z.string().optional(),
    priority: z.enum(PARAMETER_PRIORITIES).optional(),
    order: z.number().optional(),
    formFactors: z
      .array(z.enum(["phone", "tablet"]))
      .min(1)
      .refine((a) => new Set(a).size === a.length, "formFactors must be unique")
      .optional(),
  })
  .strict();
export type ContractParameter = z.infer<typeof ContractParameter>;

export const OscContractSchema = z
  .object({
    contractVersion: z.union([z.literal(1), z.literal(1.1)]),
    installation: z
      .object({
        id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
        name: z.string().min(1),
        useCase: z.enum(["lobby", "live", "both"]).optional(),
      })
      .strict(),
    software: z
      .object({
        app: z
          .enum([
            "touchdesigner",
            "touchplayer",
            "browser",
            "unreal",
            "unity",
            "resolume",
            "notch",
            "other",
          ])
          .optional(),
        version: z.string().optional(),
        project: z.string().optional(),
        os: z.enum(["windows", "macos", "linux"]).optional(),
        machines: z.number().int().min(1).optional(),
      })
      .strict()
      .optional(),
    osc: z
      .object({
        in: z.object({ protocol: z.enum(["udp", "tcp"]).optional(), port }).strict(),
        feedback: z
          .object({ port, aliveAddress: z.string().startsWith("/").optional() })
          .strict()
          .optional(),
        heartbeat: z.string().startsWith("/").optional(),
      })
      .strict(),
    parameters: z.array(ContractParameter),
    telemetry: z
      .array(
        z
          .object({
            address: z.string().startsWith("/"),
            type: z.enum(["float", "int", "string", "bool"]),
            label: z.string(),
            min: z.number().optional(),
            max: z.number().optional(),
            unit: z.string().optional(),
            rateHz: z.number().positive().optional(),
          })
          .strict(),
      )
      .optional(),
    actions: z
      .array(z.enum(["flash", "restart", "blackout", "idle", "pause"]))
      .refine((a) => new Set(a).size === a.length, "actions must be unique")
      .optional(),
    pairingOverlay: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type OscContractDoc = z.infer<typeof OscContractSchema>;

export type ContractParseResult =
  { ok: true; contract: OscContractDoc } | { ok: false; errors: string[] };

/** Validates an `otakoyi/osc-contract.json`; errors are `path: message` lines. */
export function parseContract(input: unknown): ContractParseResult {
  const r = OscContractSchema.safeParse(input);
  if (r.success) {
    const errors = systemErrors(r.data);
    return errors.length ? { ok: false, errors } : { ok: true, contract: r.data };
  }
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** A parameter's priority; untagged parameters count as `tune` (docs/integration.md step 6). */
export const priorityOf = (p: Pick<ContractParameter, "priority">): ParameterPriority =>
  p.priority ?? "tune";

/**
 * The standard System group (ADR-018): exactly these four parameters, nothing else on `/system/*`.
 * The pult shows them as the System screen in the Installation panel, never on a project screen.
 */
export const SYSTEM_GROUP = "System";
export const SYSTEM_PARAMETERS = [
  { name: "Resw", address: "/system/resw", type: "int" },
  { name: "Resh", address: "/system/resh", type: "int" },
  { name: "Debug", address: "/system/debug", type: "bool" },
  { name: "Seed", address: "/system/seed", type: "int" },
] as const;

/** Is this parameter part of the standard System group? */
export const isSystemParameter = (p: Pick<ContractParameter, "group" | "address">): boolean =>
  p.group === SYSTEM_GROUP || p.address.startsWith("/system/");

/** The contract has the System group (the draft and the exporter then add `system` to the config). */
export const hasSystemGroup = (c: Pick<OscContractDoc, "parameters">): boolean =>
  c.parameters.some((p) => p.group === SYSTEM_GROUP);

function systemErrors(c: OscContractDoc): string[] {
  const sys = c.parameters.filter(isSystemParameter);
  if (!sys.length) return [];
  const errors: string[] = [];
  for (const p of sys) {
    const std = SYSTEM_PARAMETERS.find((x) => x.address === p.address);
    if (p.group !== SYSTEM_GROUP)
      errors.push(`${p.address}: /system/* is reserved for the group "${SYSTEM_GROUP}"`);
    else if (!std)
      errors.push(
        `${p.address}: the System group holds only ${SYSTEM_PARAMETERS.map((x) => x.address).join(", ")}`,
      );
    else if (p.type !== std.type)
      errors.push(`${p.address}: must be type ${std.type} (${std.name}), got ${p.type}`);
  }
  for (const std of SYSTEM_PARAMETERS)
    if (!sys.some((p) => p.address === std.address))
      errors.push(`System group: ${std.address} (${std.name}) is missing`);
  const seen = new Set<string>();
  for (const p of sys) {
    if (seen.has(p.address)) errors.push(`${p.address}: listed twice`);
    seen.add(p.address);
  }
  return errors;
}
