# 009 — Value snapshots (reserved, not in MVP)

**Status:** Proposed

**Context.** Clients will want to save the current look ("evening, warm, 40 %") and recall it with one
tap. That is different from a control preset (ADR 008): a preset is a control's settings, a snapshot is
the values of many controls at a moment.

**Decision.** Not built now; the architecture keeps it possible:

- A snapshot is `ValueSnapshot` in `@osc/schema`: `{ id, pultId, label, values: { controlId: value },
createdBy: "client" | "studio", createdAt, configRevision }`.
- Snapshots are installation **state**, not config: the bridge stores them next to the shared control
  state. Saving one never touches the studio's config, so ADR 001 and "only the studio edits pults"
  still hold.
- Recalling a snapshot is an ordinary control change: it needs the control lease, goes through the
  same `PultStore` path (one batch of `set`s → OSC), is logged and synced to every device.
- Recall skips controls that no longer exist or whose value no longer validates (config changed since
  `configRevision`), and never includes `studioOnly`, `holdToConfirm` or display-only controls.
- The studio switches it on per installation (a config flag, default off) when the feature ships.

**Consequences.** `PultStore` keeps values as a plain `controlId → value` map so it can be exported and
applied in one batch; the bridge state store must allow a second collection besides live values.
