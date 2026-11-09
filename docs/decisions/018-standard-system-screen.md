# 018 — Standard System screen

**Status:** Accepted

## Context

Every Otakoyi installation adapts to any output size (`otakoyi-td-template` standards §5) and has
a debug overlay and a seed. These four parameters are the same everywhere, yet each client pult
would lay them out again, and they mix studio settings into the client's show controls.

## Decision

- **Contract.** Every installation's contract has a group `System` with exactly:
  `/system/resw` (int, output width px), `/system/resh` (int, height px), `/system/debug` (bool,
  debug overlay) and `/system/seed` (int, 0 = random). `/system/*` is reserved for it;
  `parseContract` rejects anything else. In TouchDesigner it is the page `System` with `Resw`,
  `Resh`, `Debug` (legacy name `Rehearsal`) and `Seed`; the contract component writes the group.
- **One standard screen.** The pult never lays the System group out with the project's own
  parameters. The Installation panel shows it as **System**, next to the system actions (Flash,
  Restart, Blackout, Idle, Pause), identical for every installation: width and height with the
  presets 1920 × 1080, 1080 × 1920, 1280 × 1280 and 3840 × 2160, steppers and a typed custom value;
  Debug as a switch; Seed as a number. Changes apply live; the values shown come from feedback. It
  is not called Settings: Settings is the app's own sheet (pairing, haptics, developer).
- **Config.** `system: { target?, resw?, resh?, debug?, seed? }` (addresses default to the four
  above). `pult-draft` and the exporter add `system: {}` when the contract has the System group.
  Pult id `system` is then reserved.
- **Runtime.** `systemPult(config)` turns `system` into a hidden pult (int faders 16–16384 px, a
  toggle, an int fader for the seed). The bridge, the in-app simulator and the app create a store
  for it next to the config's pults (`allPults`), so state, lease, coercion, echo handling and the
  activity feed apply unchanged and the protocol needs nothing new. It is never in `config.pults`:
  pult lists and the pager never show it.
- **Design system.** `SystemScreen` (`design-system/packages/ui/src/patterns/System.tsx`, story _Patterns/System
  Screen_) draws it; the app's `SystemContent` wires it to the `system` store. The Figma library
  holds one **System Screen** component (phone and tablet), so no client page redraws it.
- `pult-plan`, `pult-draft` and the exporter skip the System group when splitting project screens;
  the exporter warns about a `/system/*` address on a client pult (`system-on-pult`).

## Consequences

- Resizing for a new venue, switching the debug overlay or fixing a seed works the same on every
  installation and never costs pult space.
- Values travel as ordinary `set` / feedback, so a viewer sees changes from the device in control and
  from TouchDesigner (e.g. a size capped by TD Non-Commercial).
- Installations made before this decision need their TD page renamed to `System` (and the contract
  regenerated) before their pult shows the System screen.
