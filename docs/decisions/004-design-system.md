# 004 — Design system

**Status:** Accepted

**Decision.** App chrome uses React Native Reusables (shadcn API, components copied into
`packages/ui`) on NativeWind. Continuous controls (fader, knob, XY, meter, hold ring) are custom Skia
components; discrete controls are Views. All read `@osc/tokens`; the client brand is applied at
runtime through `createTheme(brand)` and NativeWind `vars()`.

**Consequences.** Figma library mirrors these names. Status colours stay outside the brand layer.
