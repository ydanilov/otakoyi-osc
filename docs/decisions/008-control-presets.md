# 008 — Control presets

**Status:** Accepted

**Decision.** A control may reference `preset`. Built-in presets ship in `design-system/packages/schema/src/presets.ts`
(ids `type/name`, e.g. `fader/brightness`). Custom presets are defined by the studio (Figma / exporter, ADR-014) and
published in the config's `presets`, so the app works offline. Preset fields are merged under the
control's own fields before validation; explicit fields win. Unknown presets, type mismatches and
custom ids that clash with built-ins fail validation. Clients do not create presets (only the studio
edits pults).
