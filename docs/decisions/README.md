# Architecture decision records

Short, numbered, immutable. To change a decision, add a new ADR that supersedes the old one.

| #   | Decision                                                                     | Status   |
| --- | ---------------------------------------------------------------------------- | -------- |
| 001 | One app in the store; a client "build" is a config revision, not a binary    | Accepted |
| 002 | Expo / React Native + TypeScript monorepo                                    | Accepted |
| 003 | iOS first; Android kept compiling behind platform interfaces                 | Accepted |
| 004 | Design system: React Native Reusables + NativeWind for chrome, Skia controls | Accepted |
| 005 | Bridge is the hub: shared state, control lease, local web pult, OSC fan-out  | Accepted |
| 006 | Pult never scrolls vertically; pages split into horizontally swiped screens  | Accepted |

---

## 001 — Config, not binaries

**Status:** Accepted · 2026-10-21

**Decision.** One app (“Otakoyi Control”) in the App Store. After login the app downloads the
installation's config (JSON, zod-validated, `schemaVersion` + `revision`) and renders it from the
built-in control library. White-label binaries only as a paid exception.

**Consequences.** Pult changes ship in minutes without App Review. New control types need an app
release; older apps show an “Update the app” placeholder for unknown types and keep working.

## 002 — Expo / React Native

**Status:** Accepted · 2026-10-21

**Decision.** Expo SDK 58 with a development build (custom native modules), EAS Build for iOS (no Mac
needed), pnpm + Turborepo monorepo shared with the bridge and the builder.

**Consequences.** Same language as the studio site; web pult from the same code via react-native-web.
Native UDP/TCP needs an Expo module.

## 003 — iOS first

**Status:** Accepted · 2026-10-21

**Decision.** MVP ships on iOS via TestFlight, then the App Store. Android is a later phase: platform
code sits behind TS interfaces, every dependency must support Android, Android keeps compiling in CI.

## 004 — Design system

**Status:** Accepted · 2026-10-21

**Decision.** App chrome uses React Native Reusables (shadcn API, components copied into
`packages/ui`) on NativeWind. Continuous controls (fader, knob, XY, meter, hold ring) are custom Skia
components; discrete controls are Views. All read `@osc/tokens`; the client brand is applied at
runtime through `createTheme(brand)` and NativeWind `vars()`.

**Consequences.** Figma library mirrors these names. Status colours stay outside the brand layer.

## 005 — Bridge as hub

**Status:** Accepted · 2026-10-21

**Decision.** A bridge runs on every installation. Phones and browsers connect to it; it keeps the
shared control state, grants the control lease (one device controls, others view, the studio always
wins), logs commands, serves the local web pult and sends OSC to the installation. Direct OSC from the
phone is a fallback without sync or lease.

## 006 — No vertical scrolling

**Status:** Accepted · 2026-10-21

**Decision.** Grid rows stretch to the screen height. A page that does not fit at the minimum row
height (40 pt) is split into screens between bands of controls; screens swipe horizontally with tabs.
Phones re-flow the tablet grid into half/full-width controls.
