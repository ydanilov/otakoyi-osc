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
- **Touch light** (`Touch Light`) — the press response: a soft light under the finger inside the
  control's touch surface while it is held (iOS 26 text-field highlight). See Rules.

Effect colours are bound to `elevation/*` variables, so shadows and highlights switch with the
theme mode. Pult screens never scroll. Navigation follows the Apple HIG (ADR-013): Settings and
Installation open from header buttons (edge swipes are shortcuts) as system sheets on iPhone; on iPad
Settings is a form sheet and Installation a 390 pt trailing inspector. Dialogs are content inside the
system sheet / form sheet. The scrim only dims (no blur). Debug never overlays the pult: it is a
page pushed inside Installation (Phone / 20 Debug in the sheet, Tablet / 20 Debug in the inspector,
with a back control) and from Settings › Developer › Debug. It is an inset-grouped list — Section +
List Card of Debug Rows (Connection, Traffic, Controls, Versions) and the OSC Log.

Control headers: vertical faders (and jog wheels) and knobs centre the label and value above the
control, 6 pt apart; horizontal faders keep label left / value right (`ControlFrame align`).

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

Debug: Debug Row (Kind=Metric / Control), OSC Log, Debug Tag, Debug HUD.

Controls: Fader (Absolute slot / Relative jog wheel × Vertical / Horizontal × Default / Fine / Off /
Disabled), Knob (Absolute / Relative / Color-Hue × Vertical / Horizontal × Size Regular / Compact,
240° travel), Pad (Size), Toggle (Size × Content=Text / Image), Thumbstick,
XY Pad, Meter, Toggle, Pad, Hold to Confirm, Segmented (single-select), Group Button and Button
Group (multi-select with LED strip), Button Grid, Scene List, Label, Color Picker, Unsupported,
Touch Light (press response, 134:795; board "Touch light — press response" 134:15404).

Icons: Phosphor Regular as `Icon/<name>` components — use them for every glyph.

## Component → code

Docs for every component (purpose, states, behaviour, accessibility, content limits, variant → props)
live in Storybook (`pnpm storybook`); Figma keeps a one-line description. Component and variant names
are exporter API (ADR-014). Paths are under `packages/ui/src/`.

| Figma component (variants)                                                                            | Code                                                                          | File                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Neu/*`, `Glow/*` effect styles                                                                       | `Surface depth glow`, `boxShadow()`                                           | `ds/depth.tsx`, `@osc/tokens` depth.ts                                                        |
| Touch Light (press response)                                                                          | `useTouchLight` + `TouchLightSkia` / `TouchLightView`, `PinTouchLight`        | `controls/TouchLight.tsx`, `@osc/controls` touchLight.ts, tokens `touchLight`                 |
| `Icon/<name>`                                                                                         | `<Name>Icon` + `Glyph`                                                        | `ds/icons.ts`, `ds/Glyph.tsx`                                                                 |
| Button (Variant × State)                                                                              | `Button variant pressed disabled`                                             | `chrome/Button.tsx`                                                                           |
| Icon Button (State=Default / Active)                                                                  | `IconButton active`                                                           | `chrome/Button.tsx`                                                                           |
| Badge                                                                                                 | `Badge tone`                                                                  | `chrome/Status.tsx`                                                                           |
| Connection (State=Online / Connecting / Offline)                                                      | `ConnectionStatus state`                                                      | `chrome/Status.tsx`                                                                           |
| Pult Header (Mode=Control / View / Studio)                                                            | `PultHeader mode` (+ `StatusBanner`)                                          | `pult/PultHeader.tsx`                                                                         |
| Pult Select                                                                                           | `PultSelect`                                                                  | `pult/PultSelect.tsx`                                                                         |
| Screen Tab (State), Tab Bar                                                                           | `ScreenTab active`, `TabBar`                                                  | `chrome/Navigation.tsx`                                                                       |
| Top Bar · Nav Item (State)                                                                            | `TopBar` · `NavItem active`                                                   | `chrome/Navigation.tsx`                                                                       |
| Brand Mark (Size) · Wordmark (Size)                                                                   | `BrandMark size` · `Wordmark size`                                            | `chrome/Brand.tsx`                                                                            |
| Stat Tile (Size) · Note · Info Card · Chip (Tone) · Divider (Type)                                    | `StatTile` · `Note` · `InfoCard` · `Chip` · `Divider`                         | `chrome/Status.tsx`                                                                           |
| Page Dots (Count)                                                                                     | `PageDots count active`                                                       | `chrome/Status.tsx`                                                                           |
| Loader (Tone) · Scrim (dim only) · Toast                                                              | `Loader tone` · `Scrim` · `Toast`                                             | `chrome/Loader.tsx`, `chrome/Scrim.tsx`, `chrome/Toast.tsx`                                   |
| Master Bar (State=Default / Muted)                                                                    | `MasterBar muted`                                                             | `media/MasterBar.tsx`                                                                         |
| Input (State)                                                                                         | `TextField focused error disabled`                                            | `forms/Field.tsx`                                                                             |
| Value Input (State)                                                                                   | `ValueInput` (+ `parseValueInput`)                                            | `forms/Field.tsx`, `ds/logic.ts`                                                              |
| Select (State=Default / Open / Disabled)                                                              | `Select` (iOS: `@expo/ui` Picker)                                             | `forms/Select.tsx`, `forms/Select.ios.tsx`                                                    |
| List Row (Trailing=Chevron / Value / Switch / None / Destructive)                                     | `ListRow trailing`                                                            | `forms/ListRow.tsx`                                                                           |
| Switch (State=Off / On / Disabled)                                                                    | `LedSwitch value disabled`                                                    | `forms/LedSwitch.tsx`                                                                         |
| Stepper (State=Default / Changed / Disabled)                                                          | `Stepper defaultValue` (+ `stepValue`)                                        | `forms/Stepper.tsx`, `ds/logic.ts`                                                            |
| Activity Row (Kind)                                                                                   | `ActivityRow kind`                                                            | `media/ActivityRow.tsx`                                                                       |
| Quick Action (State, incl. Hold)                                                                      | `QuickAction holdMs pressed disabled`                                         | `media/QuickAction.tsx`                                                                       |
| Image Tile (State) · Image Upload (State) — UI view                                                   | `ImageTile state` · `ImageUploadView state`                                   | `media/Image.tsx`                                                                             |
| List Card · Section · Console Panel (slots)                                                           | `ListCard` · `Section` · `ConsolePanel`                                       | `containers/Cards.tsx`                                                                        |
| Release Note (Latest) · Release Card · Pult Card (Primary)                                            | `ReleaseNote` · `ReleaseCard` · `PultCard`                                    | `containers/Cards.tsx`                                                                        |
| Dialog (Container=Modal / Sheet) — content only                                                       | `Dialog` inside the sheet / form sheet (`presentationFor`)                    | `containers/Dialog.tsx`, `ds/logic.ts`                                                        |
| Settings / Installation surfaces (sheet, form sheet, inspector)                                       | `presentationFor`, `Inspector`, `EdgeSwipe`                                   | `ds/logic.ts`, `containers/Inspector.tsx`, `containers/EdgeSwipe.tsx`                         |
| Context menu (long-press, preview) · image source pull-down                                           | `ContextMenu` · `PullDownMenu` (iOS: `@expo/ui`)                              | `menus/*`                                                                                     |
| Backdrop · Client Logo · Connect / Client loading screens                                             | `Backdrop` · `ClientLogo` · `ConnectOptions`, `ConnectForm`, `BrandedLoading` | `connect/*`                                                                                   |
| Viewfinder (Size)                                                                                     | `Viewfinder size`                                                             | `containers/Viewfinder.tsx`                                                                   |
| Fader · Knob · XY Pad · Meter · Hold to Confirm                                                       | `Fader` · `Knob` · `XYPad` · `Meter` · `HoldToConfirm`                        | `controls/*.tsx`                                                                              |
| Toggle · Pad · Segmented · Button Grid · Scene List · Label · Color Picker · Unsupported              | `discrete.tsx` exports                                                        | `controls/discrete.tsx`                                                                       |
| Pad (Size) · Toggle (Size × Content=Text / Image)                                                     | `size: regular \| compact`, toggle `image` (picture pad)                      | `controls/discrete.tsx`, `pult/layout.ts` (`minHeightFor`)                                    |
| Knob (Size=Regular / Compact)                                                                         | `size: regular \| compact`                                                    | `controls/Knob.tsx`                                                                           |
| Debug Row (Kind=Metric / Control) · OSC Log — the Debug page (Phone / Tablet 20 Debug)                | `DebugRow kind` · `OscLog` (+ `DebugStore` in `@osc/controls`)                | `debug/DebugRow.tsx`, `debug/OscLog.tsx`; page: `apps/mobile/src/components/DebugContent.tsx` |
| Debug Tag · Debug HUD (in the library, not used in the app now)                                       | `DebugTag` · `DebugHud`                                                       | `debug/Debug.tsx`                                                                             |
| Patterns: Quick Actions Row, Installation Actions, Installation Switcher, Activity Log, Stepper Group | same names                                                                    | `patterns/Installation.tsx`                                                                   |

New control types (ADR-015) — Fader Mode=Relative/Crossfade, Knob Mode=Relative/Color,
Thumbstick, Button Group, Image, Mic, Prompt — live in `controls/*` (`Jog.tsx`, `Thumbstick.tsx`,
`media.tsx`, `Prompt.tsx`, `discrete.tsx`) and have stories. Not in code on purpose: Status Bar and
Home Indicator (device chrome in mockups). Control compositions on the Patterns page (Fader Bank,
Knob Group, Camera Control, Scene Bar…) are built from config by the pult renderer.

## Rules

- Screens are built only from library instances and patterns; anything missing goes into the library first.
- Component and variant names follow the code (`controlRegistry` types, ADRs).
- Colours only through variables; a new colour starts in `tokens.json`, then here.
- The control drawing in code (Skia) is the source of truth for geometry; Figma mirrors it.
- **Touch light**: every pressable / draggable control (Fader, Knob, Pad, Toggle, Hold to Confirm,
  Group Button, Segmented per segment, Quick Action, Button, XY Pad, Thumbstick) shows a Touch Light
  while pressed — halo (primary, ~20 %) + core (white, ~20 %), centred on the touch, above the
  surface fill and below labels / icons, clipped to the surface's shape (faders: on the thumb,
  below its LED and grips; knob: on the disc, below the cap; thumbstick: on the stick). In 120 ms
  ease-out (scale 0.6 → 1), follows 1:1, out 260 ms ease-in; Reduce Motion fades only. Never on
  disabled or view-only controls. Sizes and timings: `touchLight` in `tokens.json`.

## Gallery in code

`/gallery` in the app and web pult renders every control type in Initial / Active / View-only state
under four themes (Otakoyi dark/light, two sample client brands). Use it to compare code with this library.
Storybook (`pnpm storybook`) covers every component, not only controls, with the same brands.
