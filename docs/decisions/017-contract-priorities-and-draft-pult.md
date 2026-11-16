# 017 — Contract priorities and the draft pult

**Status:** Accepted

## Context

Every installation reaches the studio as a list of parameters (TouchDesigner Custom Parameters,
already tagged by priority in the studio's TD projects). Until now an agent had to hand-write the
OSC contract and a draft config, and nobody could tell before Figma how many screens a pult would
need. ADR-014 keeps Figma as the place where the final pult is designed; the question was how to
get from the contract to a first, testable pult without manual layout.

Two options:

1. **Otakoyi Inspector** (Figma dev plugin): "Generate draft page from contract" creates the client
   page with phone and tablet frames from library components and OSC annotations.
2. **CLI** in this repo: `pnpm pult-draft --contract x.json` writes a draft config, and
   `pnpm pult-plan` prints the screen split.

## Decision

**The CLI (option 2) now; the Inspector later reuses the same module.**

- The CLI runs the pult's real `layoutPage` (ADR-006) with the token sizes, so the split it reports
  is the split the app will make. It is unit-tested in `pnpm verify` and runs in any installation
  session without Figma, a seat or the desktop app. An Inspector command could not be tested in CI
  and would duplicate the mapping until the plugin can import `@osc/pult-plan`.
- Figma stays where the final pult is designed (ADR-014): the draft config is for testing against
  the bridge and as the brief for the Figma page. The exporter still produces the published config.

### Contract 1.1

`contractVersion` 1.1 adds three optional parameter fields; a 1.0 contract stays valid:

| Field         | Values                               | Meaning                                                    |
| ------------- | ------------------------------------ | ---------------------------------------------------------- |
| `priority`    | `live` · `tune` · `setup` · `hidden` | show operator · on-site tuning · one-off · never on a pult |
| `order`       | number                               | order inside the group                                     |
| `formFactors` | `["phone"]`, `["tablet"]` or both    | where the parameter makes sense (ADR-013)                  |

Untagged parameters count as `tune`. In TouchDesigner the priority comes from the help tags
(`[live]` `[tune]` `[setup]` `[hide]`, `[danger]` → `dangerous`), defined in
`otakoyi-td-template/docs/standards.md` §4 and read by `tools/touchdesigner/otakoyi_contract`.

### Draft rules (`tools/pult-plan`)

- Drop `hidden` and the System group (ADR-018). `setup` goes to a separate pult `setup`; `live` and
  `tune` share the main pult.
- **One tab per TouchDesigner parameter page** (contract group), in TD order. The planner never
  merges, splits or reorders pages: logical grouping is decided in TouchDesigner
  (`otakoyi-td-template` standards §4). Inside a tab `live` comes first, then `tune`, each by
  `order`, so the first screen runs the show. A tab bigger than one screen gets more screens,
  swiped horizontally, where `layoutPage` splits it.
- Control from `hint`, otherwise by `type`: float → horizontal fader, int → fader with `int`, bool →
  toggle (live: pad, otherwise switch), trigger → button (`dangerous` → holdToConfirm, template →
  buttonGrid), enum → segmented (≤ 4 options) or list (sceneList), color → colorPicker, xy → xy,
  string → prompt without blending.
- Screens are counted for the primary form factor (`useCase` live → tablet, lobby / both → phone,
  or `--form`); the other form factor gets a layout of the same tabs and splits them as usual.
  Parameters limited to the other form factor go to a last tab.
- The report names the TouchDesigner fix: `live-scattered` (live on more than one page),
  `live-not-first` (the first page has no live), `live-overflow` (the live part of a tab needs more
  than one screen; "fits" also means nothing is scaled below its Figma height), `small-tab` (a page
  of one or two parameters).
- `docs/pult-capacity.md` (how much fits one screen, per control and mix, panel heights, the split
  rule) is generated from the same functions and checked by `pnpm verify`.

The exporter reads the same contract (validated with `parseContract`) and warns about a control on
a `hidden` parameter (`hidden-in-contract`) and a `live` parameter no control sends
(`live-not-on-pult`).

## Consequences

- A new installation gets a working pult (bridge + web pult) from its contract in one command; the
  studio designs the Figma page knowing the screen split in advance.
- The draft is deliberately plain (one control per parameter, no panels); the studio's Figma page
  replaces it.
- An Inspector command can be added on top of `@osc/pult-plan` once the plugin bundles workspace
  packages; until then the CLI is the only path.
