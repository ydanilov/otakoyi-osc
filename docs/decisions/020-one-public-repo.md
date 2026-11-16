# 020 — One public repo

**Status:** Accepted · 2026-11-16 · supersedes ADR-019

## Context

ADR-019 split the work in two: the design system in the public `ydanilov/otakoyi-controls`, the
product (app, bridge, protocol, contract, Figma exporter, studio tools) in the private
`ydanilov/otakoyi-osc`, joined by a git submodule. Every design-system change took two PRs (one
there, a submodule bump here), the Storybook fixture of the template pult was copied across, and
the two halves drifted (a Vercel project still built the old `apps/storybook` here). The owner
decided the whole project is public.

## Decision

- **`ydanilov/otakoyi-osc` is the one repo, and it is public.** The design system lives in
  `design-system/` as ordinary files, imported with its full history (`git subtree`), not as a
  submodule. `otakoyi-controls` is archived with a pointer here.
- Package names (`@osc/*`) and folders are unchanged, so imports, the workspace and Figma names
  stay as they were. A design-system change is one PR together with the product changes it needs.
- **Storybook** is built from `design-system/apps/storybook` of this repo (Vercel root directory).
- Before the repo went public its whole history was scanned for secrets (keys, tokens, passwords,
  private-key and `.env` files, e-mails, phone numbers): nothing but test values and private-range
  IP addresses. Keep it that way: secrets live only in GitHub and Vercel settings.

## Consequences

- No submodule: a plain `git clone`, no bump workflow, CI checks the product and the design system
  in one run.
- Everything is visible: the app, the bridge, the contract and the studio tools as well as the
  design system. Client configs and photos stay out of the repo (they live with each
  installation).
- The type-level DTO sensor (`apps/mobile/src/lib/dto-compat.ts`) and the template fixture copy
  remain: `@osc/ui` still builds without `@osc/protocol` and the exporter, so the design system
  can be lifted out again if needed.
