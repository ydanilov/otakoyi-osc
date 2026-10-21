# Figma ↔ code

File: **OSC** — https://www.figma.com/design/D2HHS8lt7PxZqxibv9PlOQ/OSC

Figma is the builder (ADR-014): there is no separate pult-builder app.

| Page                 | What                                                                                                  | Code                   |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| Cover                | File cover                                                                                            | —                      |
| Foundations          | Colour, elevation & glow, typography, rules                                                           | `packages/tokens`      |
| Components           | Design-system library in sections: icons, app chrome, forms & lists, controls, media, containers      | `packages/ui`          |
| Patterns             | Compositions: Channel Strip, Fader Bank, Knob Group, Mix, Prompt Presets, Installation Actions…       | `packages/ui`          |
| Guidelines           | Rules for composing a client pult: which control when, do/don’t, layout, annotating a build, copy     | —                      |
| iOS 27 · System      | System parts from the iOS and iPadOS 27 library: status bar, home indicator, sheets, keyboards, menus | native                 |
| Client · Phase One   | First client build: every app screen for phone and tablet, prototype flow                             | config + `apps/mobile` |
| Research, References | Mobbin research board and visual references (Neumorphic Dark Knobs is the lead one)                   | —                      |

## Client pages are the pult builder

Component documentation lives in Storybook; Figma only carries build-specific annotations: category
**OSC** (address, args, range, mode, rate, feedback) and **Depends on** on each control instance.

One page per client (`Client / <installation-id>`), built only from library instances. The exporter
(`tools/figma-export`, planned) reads the page and writes the installation config:

- frame per pult page and form factor: `<pult-id> / <phone|tablet> / <page-id>`, left to right in swipe order;
- layer name of a control instance = control `id`; component + variants = control type and mode;
- instance text properties = copy (labels, options, scene names);
- OSC address, range, curve, target, preset, lock = shared plugin data (`otakoyi`), edited with the
  Otakoyi Inspector plugin; every address must exist in the installation's OSC contract
  (`docs/integration.md`).

## Style

Neumorphic dark hardware: graphite-navy surfaces, neon lime as the only lit colour, LEDs and glow
for state. Depth is meaningful (ADR-013):

- **Raised** (`Neu/Raised`, `Neu/Raised SM`) — interactive elements, top-level cards and panels.
- **Inset** (`Neu/Inset`, `Neu/Pressed`) — active / pressed states and beds under controls
  (tracks, toggle beds, inputs, tab bars).
- **Flat** — information nested in a card (Chip, Stat Tile, icon wells, Label).
- **Glow** (`Glow/*`) — lit values, LEDs, and buttons only while pressed. Never on resting buttons.

Effect colours are bound to `elevation/*` variables, so shadows and highlights switch with the
theme mode. Pult screens never scroll; the left (Settings) and right (Installation) drawers may.
Phone dialogs are bottom sheets; tablet dialogs are centred modals. The scrim blurs the background.

## Variables

| Collection  | Modes                     | Contents                                                                   | Code                        |
| ----------- | ------------------------- | -------------------------------------------------------------------------- | --------------------------- |
| `Base`      | Value                     | Neutrals for dark and light, status colours (hidden primitives)            | `tokens.json → color`       |
| `Brand`     | one mode per client brand | `brand/*` incl. `primary-signal-light` (primary darkened to ≥ 3:1)         | installation config `theme` |
| `Theme`     | Dark / Light              | `color/*`, `control/*` (incl. `control/signal`), `status/*`, `elevation/*` | `createTheme()` output      |
| `Dimension` | Value                     | `space/*`, `radius/*`, `stroke/*`, `touch/*`, `control/*` sizes            | `tokens.json`               |

`control/fill` and `control/signal` use the brand primary in dark mode and the darkened signal
colour in light mode — same rule as `createTheme()` (`SIGNAL_CONTRAST = 3`). Buttons keep the exact
brand colour. **Status colours live only in Base and are never aliased to Brand.**

## Components

Forms: Input, Value Input (label + recessed value with unit; Default / Focus / Error / Disabled; iOS number pad), Select (native iOS 27 popup button + pull-down menu; Default / Open / Disabled), Stepper, List Row, Switch.

Chrome: Button (Primary / Secondary / Ghost / Destructive × Default / Pressed / Disabled), Icon
Button, Badge, Connection, Pult Select, Screen Tab, Tab Bar, Pult Header, Input, List Row, Switch,
Status Bar, Home Indicator, Top Bar, Brand Mark, Wordmark, Stat Tile, Note, Info Card, Chip, Loader,
Divider, Scrim, Page Dots, Nav Item, Viewfinder. Slot containers: List Card, Section, Console Panel,
Dialog (Modal / Sheet), Release Card, Pult Card.

Controls: Fader (Absolute slot / Relative jog wheel × Vertical / Horizontal × Default / Fine / Off /
Disabled), Knob (Absolute / Relative / Color-Hue × Vertical / Horizontal, 240° travel), Thumbstick,
XY Pad, Meter, Toggle, Pad, Hold to Confirm, Segmented (single-select), Group Button and Button
Group (multi-select with LED strip), Button Grid, Scene List, Label, Color Picker, Unsupported.

Icons: Phosphor Regular as `Icon/<name>` components — use them for every glyph.

## Rules

- Screens are built only from library instances and patterns; anything missing goes into the library first.
- Component and variant names follow the code (`controlRegistry` types, ADRs).
- Colours only through variables; a new colour starts in `tokens.json`, then here.
- The control drawing in code (Skia) is the source of truth for geometry; Figma mirrors it.

## Gallery in code

`/gallery` in the app and web pult renders every control type in Initial / Active / View-only state
under four themes (Otakoyi dark/light, two sample client brands). Use it to compare code with this library.
