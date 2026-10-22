# Figma → config: the exporter and the Otakoyi Inspector

Figma is the builder (ADR-014). The studio lays out each client's pult on a client page of the
**OSC** Figma file, then:

- `tools/figma-export` (`@osc/figma-export`) reads that page and writes the installation config
  (schema v2, `packages/schema`) plus a report of everything it could not map;
- `tools/figma-plugin` (**Otakoyi Inspector**, a Figma dev plugin) shows, for the selection, what
  the exporter will produce and edits the build annotations.

Both use one mapping module (`tools/figma-export/src/mapping.ts`), so the plugin and the CLI never
disagree.

## Run the exporter

```bash
# From Figma (REST API)
export FIGMA_ACCESS_TOKEN=figd_…            # personal access token, scope file_content:read
pnpm figma-export \
  --file D2HHS8lt7PxZqxibv9PlOQ --page "Client · Phase One" \
  --base path/to/base.json --contract path/to/otakoyi/osc-contract.json \
  --previous path/to/published-config.json \
  --out phase-one.config.json --report phase-one.report.md --save-snapshot phase-one.snapshot.json

# Offline, from a saved snapshot (tests, CI, or a snapshot exported by the Inspector)
pnpm figma-export --snapshot tools/figma-export/fixtures/phase-one.json \
  --out /tmp/config.json --report /tmp/report.md
```

| Option              | What                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--file`, `--page`  | File key and page (name, part of the name, or node id). Needs `FIGMA_ACCESS_TOKEN`.                                                                                         |
| `--snapshot`        | Read a saved snapshot instead (format below).                                                                                                                               |
| `--section`         | Only frames inside sections whose name contains this text (e.g. `Tablet`), or an id.                                                                                        |
| `--brand`           | Figma Brand mode for the `theme` colours (default: the mode set on the client page's sections). Needs a snapshot with Brand.                                                |
| `--base`            | What Figma does not hold: `installation` (id, name, actions), `targets`, `theme` (mode, logo, splash, font), `presets`, `pult` (id, name, defaultTarget, formFactor, icon). |
| `--contract`        | The installation's `otakoyi/osc-contract.json`; an address not in it is an error.                                                                                           |
| `--previous`        | The published config; `installation.revision` is bumped when the pults changed.                                                                                             |
| `--out`, `--report` | Config JSON (default stdout) and Markdown report (default stderr).                                                                                                          |
| `--report-json`     | The report as JSON (`valid`, `summary`, `issues`) for scripts.                                                                                                              |
| `--save-snapshot`   | REST mode: also save the fetched snapshot (to commit as a fixture or diff later).                                                                                           |
| `--allow-gaps`      | Exit 0 although the report has errors. The config is written either way.                                                                                                    |

Paths are relative to the folder the command is run from (the repo root in the examples).
Exit codes: `0` ok; `1` the config does not validate, or the report has errors (missing address,
not in the contract) and `--allow-gaps` is not set; `2` usage, network or input error.

Output is deterministic — controls in frame order, keys in a fixed order, no timestamps — so a
re-export diffs cleanly in a PR. Without `--base` the exporter derives the installation id and name
from the page name (`Client · Phase One` → `phase-one`), uses one default target (UDP 7000,
feedback 9000) and leaves the theme to the app default.

### In CI

Publishing is a PR (ADR-014): run the exporter in a workflow (manual `workflow_dispatch` or on a
schedule), commit the config and the report, and open a PR for review. A minimal job:

```yaml
- run: pnpm install --frozen-lockfile
- run: >
    pnpm figma-export
    --file ${{ vars.FIGMA_FILE }} --page "${{ inputs.page }}"
    --base installations/${{ inputs.id }}/base.json
    --contract installations/${{ inputs.id }}/osc-contract.json
    --previous installations/${{ inputs.id }}/config.json
    --out installations/${{ inputs.id }}/config.json
    --report installations/${{ inputs.id }}/report.md
  env:
    FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
```

The repo's own CI runs the exporter's unit tests and the snapshot test of the Phase One fixture
(`pnpm verify`); it needs no token.

## What the exporter reads

### Frames → pages

- **Convention:** one top-level frame per page and form factor, `<pult-id> / <phone|tablet> / <page-id>`.
- **Prototype screens** (what Client · Phase One has today): frames named `Phone / …` or
  `Tablet / …` that contain a **Pult Header** with `Mode=Control`. Screens without a Pult Header
  (connect, settings sheets, …) are ignored; `Mode=View` / `Studio` screens are skipped.
- The active **Screen Tab** in the frame's **Tab Bar** names the page (`Live 1` → id `live-1`).
  Pages are ordered by the tab bars. A second frame for the same page and form factor (connection
  lost, light theme, …) is a state variant and is skipped.
- The controls live in a child frame named `Pult` or `Console` (otherwise the frame itself).
- Phone and tablet frames of one page are merged by control id: annotate a control once, on either
  form factor. A page with only one form factor gets the other layout derived (tablet → phone with
  the schema's `reflowForPhone`, phone → tablet copied) and a warning.

### Layout

Every control's (or panel's) bounding box is mapped to the 12-column grid of its form factor:
left/right edges are scaled from the box around all controls of the frame; rows use one row unit
per frame (the shortest control's height, 32–96 pt), and empty rows are dropped. Rows only order
the controls: the app draws each at its Figma height with the Figma gaps (ADR-006). A control
missing in one form factor's frame is appended full-width at the bottom of that layout (warning).

### Panels

The outermost Console-Panel pattern instance around controls becomes a page **panel** (schema
`page.panels`), placed in the layout instead of the controls in it; its Console Panel `Title`
becomes the panel title (`MIX` → `Mix`), the layer name (or the title) its id:

| Figma pattern                                      | `pattern`                                              |
| -------------------------------------------------- | ------------------------------------------------------ |
| Fader Bank · Knob Group · Knob Row · Layer Toggles | `faderBank` · `knobGroup` · `knobRow` · `layerToggles` |
| Camera Control · Scene Bar · Show Actions          | `cameraControl` · `sceneBar` · `showActions`           |
| List Card with switch rows                         | `list` (no title)                                      |
| Mix, a bare Console Panel                          | `stack`                                                |

Phone and tablet panels are merged by id. A Channel Strip's Group Button becomes a toggle with
`style: "led"` (the strip's ON button).

### Form factor, icons

- `pult.formFactor` (ADR-013): from `--base` `pult.formFactor`, else the form factor drawn first on
  the page (a note in the report says which).
- Control icons: the first `Icon/<name>` instance inside a List Row, pad or toggle becomes the
  control's `icon` (`device-mobile`); icon options of a Segmented become `options[].icon`. The
  components' own glyphs (↻, − / +, chevrons, check) are never icons.

### Component → control

Component (set) and variant names are the exporter's API (ADR-014): renaming one in the library
needs an update in `tools/figma-export/src/components.ts` in the same PR.

| Figma component (variants)                                                                                         | Config                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Fader (Mode, Orientation, State)                                                                                   | `fader`; `Mode=Relative / Crossfade` → `mode`; `Orientation=Horizontal`; `Value` → `default` (absolute, in range) |
| Knob (Mode, Size, State)                                                                                           | `knob`; `Mode=Relative` → `relative`, `Mode=Color` → `hue`; `Size=Compact`; `240°` → `travel`                     |
| XY Pad · Thumbstick                                                                                                | `xy` (range, springs back, rate) · `thumbstick` (rate)                                                            |
| Toggle (Size) · Switch · List Row `Trailing=Switch`                                                                | `toggle` (`style: "switch"` for Switch and list rows); `State=On` → `default: true`                               |
| Group Button (outside a Button Group)                                                                              | `toggle` (e.g. a channel strip's power)                                                                           |
| Pad (Size) · Button                                                                                                | `button`                                                                                                          |
| Hold to Confirm                                                                                                    | `holdToConfirm`                                                                                                   |
| Segmented (Content)                                                                                                | `segmented`; inside a **Scene Bar**: `sceneList`                                                                  |
| Button Group › Group Button (Label, Caption, State)                                                                | `buttonGroup` with one button per Group Button; `State=On` → `default`                                            |
| Button Grid · Scene List · Label · Meter · Color Picker · Image Upload                                             | same-named types                                                                                                  |
| Mic                                                                                                                | `mic`; outputs from the annotated `<prefix>/level`, `/bands`, `/beat`                                             |
| Prompt Presets (+ Prompt Mix on the same frame)                                                                    | `prompt`; a Prompt Mix sets `blend: true`                                                                         |
| Console Panel, List Card, Section, Fader Bank, Channel Strip, Knob Group, Layer Toggles, Camera Control, Scene Bar | containers: the exporter looks inside; an OSC annotation on them is shared by the controls inside                 |
| Status Bar, Home Indicator, Pult Header, Tab Bar, Page Dots, Icon/\*, Divider, …                                   | app chrome, skipped                                                                                               |
| anything else                                                                                                      | **warning** `unknown-component`; the exporter still looks inside                                                  |

Copy: `Label` / `Title` text properties (or the component's own `Label` text layer, or the panel
title) become `label`; option and scene labels come from option text, then from quoted option
values, then from icon names (icon-only options are reported — the app needs text).

**Ids:** the layer name of the instance is the control id (ADR-014). A layer that still has the
component's name ("Fader") gets an id from its label (`Brightness` → `brightness`), then from the
panel title — the report lists these so the studio can rename the layers. Repeated names in a
frame get `-1`, `-2`, …; an id already used on another page of the pult is prefixed with the page id.

### Annotations

The studio adds two Dev Mode annotation categories per build: **OSC** and **Depends on**. The
Inspector writes them and mirrors them into shared plugin data (namespace `otakoyi`, keys `osc` and
`dependsOn`); the exporter reads the annotation, else the plugin data.

**OSC** — canonical form (one line per control or container):

```text
**/wall/brightness** `float 0–1` · absolute · 60 Hz · feedback ✓ · curve=log default=0.6
**/wall/mode** `"ambient" | "react" | "show"` · feedback ✓
**/wall/logo**, **/wall/live-data**, **/wall/audio-react** → `1 | 0`
**/mix/layer/{1–4}/opacity** `float 0–1` · **/mix/layer/{1–4}/on** `1 | 0`
**/fx/shape/{knob-id}** `float 0–1` · 240°
**/camera/aim** `x y float −1…1` · springs back · 30 Hz
**/scene** `int 1–4` · crossfade=1.5
**/mic/level** `float 0–1`, **/mic/bands** `float×4`, **/mic/beat** `1` · 30 Hz
```

- Addresses in bold; each followed by its spec in backticks: type (`float`, `int`, `string`,
  `bool`, `x y` pair), range (`0–1`, `−1…1`), values (`1 | 0` = on | off) or quoted options.
- A comma list shares the spec after its last address. `{1–4}` expands to one address per control
  in order; `{knob-id}` / `{id}` / `{name}` is filled with the control (or button) id.
- On a container, the addresses are handed to the controls inside in order, each to the first
  compatible entry (a float spec to faders and knobs, `1 | 0` to toggles, options to segmented, …).
- Shared keywords: `N Hz` (rate), `absolute` / `relative`, `feedback ✓`, `springs back`, `N°`,
  `multi-select`, and `key=value` (`min`, `max`, `step`, `curve`, `default`, `unit`, `target`,
  `lock`, `studioOnly`, `feedback=/addr`, `crossfade`, `holdMs`, `tone`, `deadzone`, `gain`, …).
- A line starting with `draft` is a note; draft annotations are listed in the report.

**Depends on** — `when <control-id> = <value>` lines (or `is on` / `is off`) become `enabledWhen`
in the config: the pult draws the control Disabled until every condition holds. Other lines are
notes for people and appear in the report.

### Report

Errors: `missing-address`, `not-in-contract`, `schema`, `no-pult-frames`. Warnings:
`unknown-component`, `duplicate-address`, `unused-address`, `option-count`, `tabs-disagree`,
`tab-without-frame`, `missing-form-factor`, `not-on-form-factor`, `prompt-mix-address`,
`draft-annotation`, … Notes: skipped frames, derived ids and labels, Depends on notes. A control
without an address is left out of the config so the rest still validates.

### Snapshot format

The exporter's input is a plain JSON snapshot (`tools/figma-export/src/snapshot.ts`):
`{ format: "otakoyi-figma-snapshot", version: 1, fileKey, page: {id, name}, nodes }`, where each
node has `id`, `name`, `type`, `box` `[x, y, w, h]`, `text`, `component` (set name), `props`
(variant / text / boolean properties without the `#id` suffix), `annotations`
(`{category, text}`), `plugin` (shared `otakoyi` data), `brandMode` (the Brand variable mode set on
a section or frame) and `children`. The snapshot also carries `brand` — the Figma `Brand`
collection: `{collection, defaultMode, modes: {<mode>: {"brand/primary": "#…", …}}}` — and
`page.brandMode`. The REST converter, the Inspector's **Export snapshot** and the fixtures all
produce it. The REST API may not return Dev Mode annotations, and its Variables API is
Enterprise-only (no Brand modes); use **Export snapshot** and run the CLI with `--snapshot`.

## Adding a client theme

Each client's colours are a **mode** of the Figma `Brand` variable collection (`brand/primary`,
`on-primary`, `primary-pressed`, `primary-subtle`, `accent`, `on-accent`,
`primary-signal-light`); `Otakoyi` is the default and equals `brandDefaults` in
`packages/tokens/tokens.json` (`pnpm tokens:check` fails when they drift, against
`packages/tokens/figma/brand-modes.json`).

1. In Figma, Variables › Brand: add a mode named after the client (`Aurora · Phase One`) and set
   its colours. `primary-signal-light` must reach 3:1 on the light background (else the exporter
   drops it with a warning and the app derives it).
2. Select the client page's sections (or frames) and set their Brand mode to the new mode.
3. Run the Otakoyi Inspector › **Export snapshot** and `pnpm figma-export --snapshot <file>` (or
   pass `--brand "<mode>"`): the config's `theme` gets the mode's colours; `--base` adds the logo,
   splash and theme mode. The app recolours the loading screen, pult and controls from it.
4. A new mode for the studio itself (not a client): also update `packages/tokens/figma/brand-modes.json`.

## Otakoyi Inspector (Figma plugin)

```bash
pnpm --filter @osc/figma-plugin build      # → tools/figma-plugin/dist/code.js
```

Install it in the **Figma desktop app**: Plugins → Development → **Import plugin from manifest…**
→ choose `tools/figma-plugin/manifest.json`. Run it from Plugins → Development → Otakoyi Inspector
(Design mode, or Dev Mode → Plugins for read-only inspection). Rebuild after pulling changes;
Figma reloads `dist/code.js` the next time the plugin starts.

- **Exporter output** — for the selected instance (or a panel / container): control type, id and
  where it came from, OSC address, the control JSON checked with the schema, and the exporter's
  errors and warnings for it.
- **OSC** / **Depends on** — the selection's annotations. **Check** previews the export with the
  edited text; **Save annotations** writes both Dev Mode annotations (creating the categories if
  the file lacks them) and the shared plugin data. Editing works in Design mode.
- **Export snapshot** — downloads the current page as a snapshot for `--snapshot`.

## Client · Phase One today

`tools/figma-export/fixtures/phase-one.json` is a snapshot of the page (pult screens in full, other
screens as frame shells, the Brand modes; the sections use `Aurora · Phase One`);
`phase-one.config.json` and `phase-one.report.md` next to it are the exporter's output, kept as
snapshot tests. Re-dump the fixture when the page changes.
