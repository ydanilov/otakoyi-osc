# 014 — Figma is the builder

**Status:** Accepted

**Context.** Every client gets a fully designed pult: which controls, in what order and size, every
label and caption, phone and tablet layouts (ADR-013). Designing that in Figma and then re-entering
it in a builder doubles the work and drifts.

**Decision.** The studio lays out each client's pult in the OSC Figma file, built only from library
components and patterns. An exporter reads the file and produces the installation config; Figma
owns layout and copy, the config stays the only thing the app reads (ADR-001 unchanged).

Figma conventions:

- One page per client: `Client / <installation-id>`. The page's `Brand` variable mode is the
  client theme (primary, accent, mode, font, logo).
- One top-level frame per pult page and form factor: `<pult-id> / <phone|tablet> / <page-id>`,
  frame title = page title. Frames sit in swipe order, left to right.
- Every control is an instance of a library component. Component set + variants give the type and
  mode (`Fader Mode=Relative` → `fader` with `relative: true`, `Knob Mode=Color` → hue knob, …).
- Instance text properties are the copy: `Label`, captions, option labels, scene names.
- Behaviour that has no visual — OSC address, range, curve, step, target, preset, lock, studioOnly —
  lives in the instance's shared plugin data (`otakoyi` namespace, JSON), edited with a small studio
  Figma plugin ("Otakoyi Inspector"). The layer name is the control `id`.
- Layout is read from auto-layout geometry and mapped to the 12-column grid per form factor.

Exporter (`tools/figma-export`, Node + Figma REST API):

1. Fetch the client page (nodes, component properties, shared plugin data, variables).
2. Map instances to schema controls; merge phone and tablet frames by control `id`.
3. Validate with the zod schema, run `checkBrand()`, fail on unknown components or missing addresses.
4. Diff against the published revision, bump `revision`, write the config for review and publishing.

**Documentation split.** Component documentation (purpose, do/don't, anatomy, states, behaviour,
accessibility, Figma mapping) lives in Storybook, next to the code. Figma components carry a one-line
description only. Client pages carry what is specific to that build as Dev Mode annotations on the
control instances: category **OSC** (address, arguments, range, mode, rate, feedback) and category
**Depends on** (other controls, installation state, hardware, lease). The Figma **Guidelines** page
holds the rules for composing a client pult.

**Consequences.**

- Schema v2: a page holds controls once and a layout per form factor (`layout.phone`,
  `layout.tablet` with grid placements). v1 configs migrate by copying `grid` into both layouts.
- **There is no separate builder app.** The roadmap's "pult builder" phase becomes the exporter
  plus the Otakoyi Inspector plugin. Publishing = exporter output reviewed in a PR and uploaded to
  the bridge (later the cloud). Brand checks, schema validation and the OSC test-send that the
  builder would have done move to the exporter CLI and the inspector plugin.
- The installation side declares what it accepts in an **OSC contract**
  (`otakoyi/osc-contract.json` in the installation repo, format in `docs/osc-contract.schema.json`,
  guide in `docs/integration.md`). The exporter fails on a control whose address is not in it.
- Library component names and variant values are now API: renaming one is a breaking change and
  needs an exporter mapping update in the same PR.
- A client's unique visual (not in the library) is added to the library first, then used.
