# 015 — New control types and schema v2

**Status:** Accepted

## Context

The Figma design system (file OSC, see `docs/figma.md`) added controls the code did not have:
crossfade and jog faders, endless and colour-hue knobs, a hardware switch, multi-select button
groups, a thumbstick, and three "media" controls that live installations ask for — guest photo
upload, on-device audio analysis and text prompts for generative pieces. ADR-014 also needs a
config that holds a phone and a tablet layout per page (ADR-013).

## Decision

### Schema v2

- `schemaVersion: 2`. A page holds its controls once, without `grid`, plus
  `layout: { phone: { <controlId>: Grid }, tablet: { <controlId>: Grid } }`. Every control needs a
  placement in both layouts; placements of unknown ids and overflow past 12 columns are errors.
- v1 configs keep working: on parse (`migrateConfig`, before presets) a control's `grid` becomes its
  tablet placement and is re-flowed for the phone placement (half / full rows, what the v1 app showed
  on phones). The app reads v1 and v2; a config newer than 2 is reported as `newer-schema`.
- `reflowForPhone` lives in `@osc/schema`; the renderer uses the page's own layout per form factor.

### Modes of existing controls

| Field                | Values                                              | Sends                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fader.mode`         | `absolute` (default)                                | `<address> f` in min..max                                                                                                                                                                            |
|                      | `relative` — endless jog                            | `<address> f` = change since the last message (full track = max − min)                                                                                                                               |
|                      | `crossfade` — A/B mix, centre detent                | `<address> f` in min..max (0..1 by default); `labels: {a, b}`, `detent`                                                                                                                              |
| `fader.response`     | `relative` (default) / `absolute`                   | unchanged (ADR-007): how a touch maps, for absolute and crossfade modes                                                                                                                              |
| `knob.mode`          | `absolute` (default)                                | `<address> f` in min..max over `travel` degrees (default 240, hard stops)                                                                                                                            |
|                      | `relative` — endless encoder                        | `<address> f` = change since the last message (one travel = max − min)                                                                                                                               |
|                      | `hue` — colour wheel                                | `<address> f` hue in degrees 0..360, wraps past 360; min/max ignored                                                                                                                                 |
| `knob.endless`       | deprecated                                          | still read as `mode: "relative"`                                                                                                                                                                     |
| `toggle.style`       | `button` (default) / `switch` (two LEDs)            | unchanged: `<address> on…` / `<address> off…`                                                                                                                                                        |
| `colorPicker.format` | `hsb` (default) — three addresses                   | `<address>/h f` (degrees 0..360; `hueRange: "unit"` → 0..1), `<address>/s f`, `<address>/b f` (0..1); each only when that channel changed; feedback per channel (on `<feedback or address>/h\|s\|b`) |
|                      | `hsvFloat` / `rgbFloat` / `rgbInt` / `hex` — opt-in | one message on `<address>`: `h s v` floats 0..1, `r g b` 0..1, 0..255, or `"#RRGGBB"`; feedback in the same format                                                                                   |

Colour channels are separate so an installation maps each to its own parameter and a brightness
move does not resend hue and saturation. A channel that is undefined for the colour is never sent
(no hue for a grey, no saturation for black); one that becomes defined again is always sent. v1
configs without `format` keep v1's default, `rgbFloat`, through `migrateConfig`.

`int: true` sends `i` instead of `f` everywhere above. Relative controls sum their deltas inside the
throttle window (`createDeltaAccumulator`), so no movement is lost; zero changes are not sent.
Relative controls hold no value, ignore feedback and have no double-tap reset.

### New control types

| Type          | Config                                                                                             | OSC                                                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buttonGroup` | `buttons: [{ id, label, caption?, address, value? }]`, `default: [ids]`                            | per button, independent latching: on → `<button.address> value` (default `1`), off → `0`. An interaction sends only the changed button; a full sync sends all. Feedback on a button's address lights that button. |
| `thumbstick`  | `address`, `rateHz` (30), `deadzone` (0.1, radial, travel rescaled), `press?`                      | while held: `<address> f x f y` (−1..1, y up) every 1/rateHz s, even when still; on release springs to centre and sends `0 0` once. Tap: `<press> 1`, `<press> 0`.                                                |
| `image`       | `address`, `aspect` (16:9 4:3 1:1 9:16 free), `formats`, `maxMB` (10), `fit`, `library`            | after a validated upload or "show" from the library: `<address> s <absolute path on the installation machine>`                                                                                                    |
| `mic`         | `address` prefix, `rateHz` (30), `outputs` ⊆ level / bands / beat, `bands` (8), `gain` (1)         | `<address>/level f` (RMS 0..1), `<address>/bands f×bands` (log-spaced, 0..1), `<address>/beat i 1` only on a beat. Audio never leaves the device.                                                                 |
| `prompt`      | `address`, `blend` (true), `maxLength` (500), `maxPresets` (32), `default` mix, `confirmMs` (4000) | blend: `<address>/a s`, `<address>/b s`, `<address>/mix f`; without blend: `<address> s`. A preset switched off (or no preset) sends `""` in its slot.                                                            |

### Where things live

- **Images.** The pult uploads the raw file over HTTP to the bridge
  (`POST /api/images?pult=&control=&name=`). The bridge checks the format by content and the size
  against the control, stores it in `<data>/<installation>/uploads`, keeps the library in
  `images.json` (`GET /api/images`, `POST /api/images/<id>/show`, `DELETE /api/images/<id>`) and is the
  only one that sends the path: a device can never `set` an image value, so no device can make the
  installation open an arbitrary file. Without `library`, a new upload replaces the previous one.
- **Prompt states** (Figma: Prompt Preset card / Prompt Presets): cards are Off, On, In blend,
  Disabled, Applying (amber, waiting for the installation to confirm), Error (not confirmed; a tap
  retries) and Editing; the list is Active, Applying, All off (base look), Editing, Empty or Error.
  The logic is `presetCardState` / `presetsPatternState` in `@osc/controls`; confirmation,
  duplicate, reorder and delete with undo are in ADR-016.
- **Prompt presets** are created by clients at runtime. Like value snapshots (ADR-009) they are
  installation state, stored by the bridge in `prompts.json` (`GET/POST /api/prompts?pult=&control=`,
  `PATCH/DELETE /api/prompts/<id>`), never in the config — so ADR-001 and "only the studio edits pults"
  still hold. The control's value carries the resolved texts and the mix; the bridge checks
  `maxLength`.
- **Mic** analysis runs on the device (`analyzeBlock` in `@osc/controls`); frames go through the
  normal `set` path.
- HTTP calls use the socket's credentials: `x-otakoyi-secret` (PIN or studio key) and
  `x-otakoyi-device`. Anything that sends OSC or changes state needs the lease (or the studio).
- Platform parts (photo picker, microphone capture) sit behind `ControlServices` interfaces in
  `@osc/ui`; the app chooses the implementation. The web pult uses a file input and Web Audio.

## Consequences

- An app without these types still shows "Update the app" for them (ADR-001); v1 configs keep
  rendering. Exporter (ADR-014) maps `Fader Mode=Relative` → `mode: "relative"`, `Knob Mode=Color` →
  `mode: "hue"`, `Switch` → toggle `style: "switch"`, `Button Group` → `buttonGroup`.
- The bridge now has persistent installation state (`--data`, default `apps/bridge/data`), the same
  place value snapshots will use.
- Native photo picking and microphone capture need native modules and a development build; until
  then the iOS app shows these controls as "not available on this device yet". The web pult works.
- When prompt presets or the image library change, the bridge tells every pult with a `data`
  message (protocol v2, ADR-016) and they fetch the list again.
