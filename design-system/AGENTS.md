# Otakoyi Controls — agent guide

The design system of Otakoyi Control (tokens, control logic, components, Storybook). Read this
before every task. Before designing or changing any UI, also read [DESIGN.md](DESIGN.md): the
design intent — what the pult should feel like, and what was tried and rejected.

This folder is the design system inside the one `otakoyi-osc` repo (ADR-020); the root `AGENTS.md`
applies too. Keep package names (`@osc/*`) and exports stable, and keep `@osc/ui` free of product
packages (`@osc/protocol`, `@osc/contract`) so it builds on its own; a breaking change updates the
app in the same PR.

## Hard rules

1. **Tokens only.** Colours, spacing, radii and type come from `@osc/tokens`. Skia controls read
   `useTheme()`; NativeWind classes use semantic names. Never hardcode hex in components.
2. **Brand ≠ status.** A brand overrides `primary`, `accent`, neutrals, font and logo only.
3. **The pult never scrolls vertically.** Pages that do not fit split into screens (`layoutPage`).
4. **Logic is unit-tested.** Mapping, throttling, messages and layout live in pure TS with tests;
   components only draw and forward gestures.
5. **Every component has a story** with `componentDocs()` and a story per state; `play` tests where
   interactive. Add a Changelog entry (`apps/storybook/docs/Changelog.mdx`) with every change.
   Storybook text is for readers: no ADR numbers or other internal references — say the rule.
6. **Figma names are API.** Renaming a component or variant is a breaking change.
7. **One switch.** Every on/off switch is the iOS-size `MenuSwitch` (Figma `Menu Switch`), on the
   pult too. Never add a larger or restyled switch.

## Workflow

Branch `feat/<slug>` / `fix/<slug>`, conventional commits. Before every commit: `pnpm verify`; for
UI changes also `pnpm build-storybook && pnpm test-storybook`.
