# 019 — The design system lives in the public otakoyi-controls repo

**Status:** Accepted

## Context

The design system (tokens, OSC codec, config schema, control logic, components, Storybook) was
published as the public repo `ydanilov/otakoyi-controls` for the studio's portfolio, as a copy of
this repo's packages. Two copies drift: a fix made in one is missing in the other.

## Decision

- **One source.** `otakoyi-controls` is the only home of `@osc/tokens`, `@osc/core`,
  `@osc/schema`, `@osc/controls`, `@osc/ui` and the Storybook (`@osc/storybook`). This repo checks
  it out as the git submodule `design-system/` (https URL, so CI and Vercel clone it without
  credentials) and includes `design-system/packages/*` and `design-system/apps/*` in the pnpm
  workspace. Package names and imports are unchanged.
- **Product-only stays here.** The app, bridge, protocol, bridge core, simulator, Figma exporter
  and plugin, pult-plan, TouchDesigner tools and the installation contract. The contract
  (`otakoyi/osc-contract.json`, ADR-017/018) moved from `@osc/schema` to `@osc/contract`
  (`packages/contract`): it ties the pult to an installation repo and has no place in the public
  design system.
- **Workflow.** A design-system change is a PR in `otakoyi-controls` first (its own CI: verify,
  Storybook, layout sensor). After it merges, this repo moves the submodule in a PR
  (`git submodule update --remote design-system`), and CI runs the whole product against it. The
  `Bump design system` workflow does that every Monday and on demand.
- **Sensors across the boundary.**
  - `apps/mobile/src/lib/dto-compat.ts`: the media and prompt DTOs the design system declares match
    `@osc/protocol` (typecheck fails otherwise).
  - `tools/figma-export/src/fixture-sync.test.ts`: the template config the design system's stories
    render equals the exporter's fixture. `pnpm fixtures:sync` copies it; then open a PR there.
- **Storybook** is built and deployed from the public repo only (`otakoyi-controls.vercel.app`).
  The scripts `pnpm storybook`, `build-storybook` and `test-storybook` here run that package, so CI
  still renders every story against the product's workspace.

## Consequences

- Clone with `git clone --recurse-submodules`, or run `git submodule update --init` after cloning.
- Editing a design-system file inside `design-system/` edits the submodule checkout: commit it in
  that repo (branch, PR), never only here.
- A breaking change in the design system (renamed export, schema change) needs a matching PR here
  before the submodule bump merges.
