# 021 — Setup lives in the Installation panel

**Status:** Accepted · 2026-11-16

## Context

TouchDesigner parameters tagged `[setup]` are set once on site (frame rate, mirroring, a calibration
offset) and then left alone. The draft put them in a second pult, "Setup", which the client met in
the pult switcher next to the real show controls. The owner decided that all settings live in a
separate menu, not on the pult.

## Decision

- A pult may carry `placement: "installation"`. Such a **Setup pult** is shown in the Installation
  panel as **Setup**, below the standard System screen, and never in the pult switcher or the pager
  (`screenPults(cfg)` / `setupPults(cfg)` in `@osc/schema`). A config needs at least one pult on the
  pult screen.
- It is an ordinary pult otherwise: the bridge keeps a store for it, so values, the lease, the echo
  and the activity feed work unchanged and the protocol needs nothing new.
- The design system draws it with the **Setup Screen** pattern: one section per TouchDesigner
  page, controls stacked at their natural height. Inside a sheet or inspector it may scroll; the
  pult screen still never does.
- `pult-draft` turns every `[setup]` parameter into the Setup pult (one page per TD page). The Figma
  exporter sets `placement` from `--base` (`pult.placement`).

## Consequences

- The pult holds only what the operator uses during a show; one-off parameters are one tap away in
  Installation, next to System, for whoever has control.
- A Setup pult never shows on its own: an installation whose contract has only `[setup]`
  parameters gets a warning (`setup-only`) and no valid draft until the show parameters are tagged.
