---
name: otakoyi-integrate
description: Make an Otakoyi installation controllable from Otakoyi Control (the pult / controller app). Use for any project whose name starts with [TD], and whenever the task mentions the pult, OSC, a controller, remote control, Otakoyi Control, an OSC contract or osc-contract.json.
---

# Otakoyi Control — integrate an installation

Otakoyi Control is the studio's controller: a bridge on the installation machine turns the client's
phone / tablet / web pult into plain OSC for the installation software. The source of truth is the
private repo **`ydanilov/otakoyi-osc`**. Studio rules for TouchDesigner projects are in
**`ydanilov/otakoyi-td-template`**.

## 1. Attach the repos

- Attach `ydanilov/otakoyi-osc` (owner `ydanilov`, repo `otakoyi-osc`) and read its
  `docs/integration.md`. Everything below is its short version; when they differ, the repo wins.
- A `[TD]` project: also attach `ydanilov/otakoyi-td-template` and follow its `CLAUDE.md`
  (folders, relative paths, Custom Parameter tags, adaptive output, sensors, delivery checklist).

## 2. Short version of the integration

1. **Ports**: OSC In on UDP **7000**, feedback to **127.0.0.1:9000**, `/sys/fps` once a second.
   Sensors use the installation's own block in 10000–10099 (registry:
   `otakoyi-td-template/docs/installations.md`). Rules: `otakoyi-osc/docs/ports.md`.
2. **Addresses**: lowercase `/<area>/<parameter>`. Reserved: `/otakoyi/*`, `/sys/*`, `/system/*`.
   Echo every parameter on its own address.
3. **Tags** on every Custom Parameter's help: `[live]` `[tune]` `[setup]` `[hide]`, plus
   `[danger]` for visible / irreversible changes. Untagged = `tune` with a warning.
4. **System page** `System` with exactly `Resw`, `Resh`, `Debug` (legacy `Rehearsal`), `Seed`:
   the pult shows it as the standard System screen in the Installation panel, never on a project
   screen (ADR-018).
5. **TouchDesigner**: build `tools/touchdesigner/build_otakoyi_contract.py`, point `Target` at the
   top-level COMP, set `Pairing` to the `otakoyi_pairing` COMP, pulse **Generate** → commit
   `otakoyi/osc-contract.json`. The same COMP receives OSC, echoes changes, sends `/sys/fps` and
   handles `/otakoyi/*` (flash, blackout, Idle / Pause / Restart parameters). Composite its output
   and the pairing overlay over the final output. Other engines: write the contract by hand
   (`docs/osc-contract.schema.json`, `contractVersion` 1.1) and wire OSC as in integration steps 1–3.
6. **Check the pult before Figma** (in the otakoyi-osc clone, `pnpm install` once):
   - `pnpm pult-plan --contract <abs path>/otakoyi/osc-contract.json` (and `--form phone|tablet`):
     which groups and controls land on which screen; warns when `live` needs more than one screen.
   - `pnpm pult-draft --contract <path> --out draft-config.json --report draft-report.md`: a draft
     config to test with the real bridge (`OTAKOYI_PIN=2468 pnpm bridge --config <abs path>`).
   - How much fits a screen: `docs/pult-capacity.md`.

## 3. Hand back (integration step 7)

1. `otakoyi/osc-contract.json` (valid; `pnpm pult-plan` reads it without errors).
2. `pnpm pult-plan` output for phone and tablet, the draft config and its report.
3. Software and version, project file, OS of the installation machine.
4. Notes: several machines, a browser engine, parameters that must never change during a show.

Do not design the pult layout in the config (Figma owns it, ADR-014), do not put secrets in the
contract, and do not open PRs on `otakoyi-osc` from an installation task unless the studio asked.

## Links

| Topic                            | Where (in `ydanilov/otakoyi-osc`)        |
| -------------------------------- | ---------------------------------------- |
| Full guide                       | `docs/integration.md`                    |
| TD contract component + receiver | `tools/touchdesigner/README.md`          |
| Contract schema, priority, order | `docs/osc-contract.schema.json`, ADR-017 |
| Draft pult, screen plan          | `tools/pult-plan`, ADR-017               |
| Screen capacity (generated)      | `docs/pult-capacity.md`                  |
| Ports, several targets, sensors  | `docs/ports.md`                          |
| Standard System screen           | ADR-018                                  |
