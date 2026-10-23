# Integrating an installation with Otakoyi Control

**Audience:** an agent (or developer) working in an _installation_ project, such as a TouchDesigner
patch, a browser engine or a Unity/Unreal build, that has to become controllable from Otakoyi
Control. You are not expected to change this repo. Read this page and follow the steps. When you
finish, hand the studio the files listed in [step 7](#7-hand-back-to-the-studio).

> Access: `ydanilov/otakoyi-osc` is private. In Claude Code on the web, attach it to your session
> (owner `ydanilov`, repo `otakoyi-osc`) or clone it next to your project. Everything below
> refers to paths in this repo.

## What Otakoyi Control is (in 60 seconds)

- The client controls an installation from an **iPhone/iPad app** or a **web pult** in the browser.
  The app is the same for every client. What changes per client is the **config** (ADR-001), a
  JSON file that lists the controls, OSC addresses, layout and brand.
- On the installation machine runs the **bridge** (`apps/bridge`, Node). Phones connect to it over
  WebSocket. The bridge keeps the shared state, decides who has control (the lease), logs commands
  and is **the only thing that sends OSC** to your software (ADR-005, ADR-010).
- Your software only has to speak **plain OSC**: receive parameters on one UDP port and send
  values back to another port.
- The studio designs each client's pult **in Figma** (ADR-014). There is no separate builder. An
  exporter turns the Figma page into the config. Figma decides how the pult looks. Your project
  decides which parameters exist and how they behave. The bridge between those two is your
  **OSC contract**, described in step 6.

```
 iPhone / iPad / browser ──WebSocket──▶ bridge ──OSC/UDP :7000──▶ your software
                          ◀─ state ───        ◀─ feedback :9000 ─
```

## 1. Receive OSC

- Open an **OSC In on UDP port 7000** (or another port; it must match the config `targets[].port`).
- **One address = one parameter.** Use lowercase `/<area>/<parameter>`, e.g. `/wall/intensity`,
  `/wall/hue`, `/scene`, `/cue/3`. The address must not contain spaces or `# * , ? [ ] { }`.
- Prefer **normalised floats 0..1** for continuous parameters and scale inside your project.
  Otherwise the range goes in the contract (`min`/`max`) and the pult sends real units.
- Make every parameter **idempotent**: the same value sent twice must not toggle anything. For
  one-shot triggers, expect `1` on press and `0` on release (that is the button default).
- **Reserved prefixes** (never use them for your own parameters): `/otakoyi/*` (system messages
  from the bridge) and `/sys/*` (telemetry and heartbeat).

The exact message each control type sends is defined in code:
`packages/controls/src/logic.ts` → `messagesFor()`. Summary for schema v1:

| Control (config `type`) | Sends                                                                 | Typical use            |
| ----------------------- | --------------------------------------------------------------------- | ---------------------- |
| `fader`, `knob`         | `address float` in `min..max` (curve applied; `int: true` → int)      | brightness, speed, hue |
| `xy`                    | `address float x float y`                                             | focus point, position  |
| `button`                | `address 1` on press, `address 0` on release (configurable)           | flash, trigger         |
| `toggle`                | `address 1` / `address 0` (configurable `on` / `off` args)            | logo on/off            |
| `holdToConfirm`         | `address 1` once after the hold completes                             | blackout, reset        |
| `segmented`             | `address <option value>` (number or string)                           | mode: ambient / show   |
| `sceneList`             | `address <scene value> [crossfadeSeconds]`                            | scene recall           |
| `buttonGrid`            | `/cue/{index}` (or `{row}`/`{col}`) → `address 1` / `0`               | cue grid               |
| `colorPicker`           | three addresses: `address/h` (hue °), `address/s`, `address/b` (0..1) | tint, light colour     |
| `label`, `meter`        | nothing; they only **display** values you send back                   | FPS, audio level       |

**Colour** (`colorPicker`, default `format: "hsb"`): each channel has its own address, e.g.
`/light/color/h` (hue in degrees 0..360, or 0..1 when the config says `hueRange: "unit"`),
`/light/color/s` and `/light/color/b` (0..1). A message is sent **only when that channel changes**
(moving brightness sends only `/b`), and a grey or black never sends a hue (black never sends a
saturation), so keep each channel in its own parameter. Echo each channel on its own address as
feedback. In TouchDesigner that is three OSC In channels into e.g. an HSV Adjust or a Constant TOP's
colour via `colorsys.hsv_to_rgb(h/360, s, b)`. If your project wants one message instead, ask the
studio for an explicit single-message format: `hsvFloat` (`address h s v`, floats 0..1),
`rgbFloat` (`address r g b`, 0..1), `rgbInt` (0..255) or `hex` (`"#RRGGBB"`).

Schema v2 adds crossfade, relative and hue variants, thumbstick, button group, image, mic and
prompt controls; `messagesFor()` and `packages/schema/src` are the reference for them.

## 2. Send feedback

Send OSC to the bridge on **UDP 9000** (config `targets[].feedbackPort`) at `127.0.0.1` when the
bridge runs on the same machine.

- **Echo state**: when a parameter changes (from the pult, a schedule or your own logic), send the
  current value on **the same address**. Every phone then shows the real state. Echoing every
  incoming message straight back is fine, also at full drag rate: the bridge recognises the echo
  of its own recent commands (float32 rounding allowed, `ECHO_WINDOW_MS` = 2 s) and keeps the
  exact value the pult sent; a value you report that is not such an echo is applied at once.
- **Stay alive**: the bridge marks the target **offline** if it hears nothing for **5 s**
  (`FEEDBACK_TIMEOUT_MS`). Send something at least once a second; `/sys/fps <float>` at 1 Hz is
  the convention.
- **Telemetry for meters and labels**: e.g. `/wall/audio/level <0..1>` at about 10 Hz. A `meter` or
  `label` control in the config points at that address with `feedback`.
- With **Otakoyi Runtime** (ADR-011) the target can also declare `runtime.heartbeat`, e.g.
  `/sys/heartbeat`. If that address stops, the bridge restarts the software.

## 3. Handle system messages from the bridge

| Address (bridge → you)                                           | Meaning                                                                              | Status    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| `/otakoyi/pair show:int secondsLeft:int app:str web:str pin:str` | Show or hide the pairing card (QR + PIN) on the installation output                  | available |
| `/otakoyi/flash`                                                 | Quick visual identify (e.g. a brief white flash) so staff know which screen is which | available |
| `/otakoyi/blackout 0\|1`                                         | Black output / restore                                                               | available |
| `/otakoyi/idle 0\|1`                                             | Idle mode: stop reacting to people (sensors, camera), keep the ambient loop          | available |
| `/otakoyi/pause 0\|1`                                            | Pause the show (optional; only if the installation lists the `pause` action)         | available |
| `/otakoyi/restart`                                               | Restart the show (the Runtime supervisor may restart the process instead)            | available |
| `/sys/ping`                                                      | Heartbeat probe; any feedback counts as an answer                                    | available |

| Address (you → bridge)  | Meaning                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `/otakoyi/pair/request` | Start pairing mode, e.g. on Ctrl+Shift+P on the installation machine |

Do not echo `/otakoyi/*` back to the bridge. The pult triggers these from its Installation panel
(quick actions Flash / Restart / Blackout, modes Idle / Pause), and the panel shows your `/sys/fps`
as the installation's FPS.

## 4. TouchDesigner specifics

`tools/touchdesigner/` has two ready pieces:

- `otakoyi_test.tox` / `build_otakoyi_test.py`: a reference patch that behaves like an installation
  (OSC In 7000 → values table → preview, echo to 9000, simulated `/sys/fps` and audio level).
  Copy its wiring.
- `otakoyi_pairing.tox`: the pairing overlay. Forward `/otakoyi/*` from your OSC In callback to
  `op('otakoyi_pairing/logic').module.handle(address, args)` and composite the COMP over your
  final output. Details are in `tools/touchdesigner/README.md`.

For other engines, the same contract over any OSC library works. A browser engine cannot receive
UDP; it connects to the bridge instead (ADR-005), so tell the studio if that is your case.

## 5. Test locally against the real bridge

```bash
git clone https://github.com/ydanilov/otakoyi-osc && cd otakoyi-osc
pnpm install
pnpm --filter @osc/mobile build:web            # web pult, served by the bridge
OTAKOYI_PIN=2468 pnpm bridge --config /absolute/path/to/draft-config.json
# open http://localhost:8080, PIN 2468; header turns "Online" when your feedback arrives
# OTAKOYI_DEBUG=1 logs every OSC packet in and out
```

**Debug page.** In the app or the web pult: Installation › Debug (or Settings › Developer › Debug).
It never covers the pult. It lists the connection (bridge, round trip, target, time since your last
feedback, who is in control), the traffic (messages sent / received per second, the installation's
FPS from your `/sys/fps`), every control on the current pult with its OSC address (or template), the
last value sent and its send rate, a live log of the last 50 OSC events (→ sent, ← received, newest
first) and the protocol / config / schema versions. The app pings the bridge and polls its health
only while the page is open.

The draft config is only for testing; the real one is exported from Figma. Start from
`packages/schema/examples/demo-installation.json`: set `targets[0].port` / `feedbackPort` and
replace the controls with your parameters. `parseConfig()` in `packages/schema` validates it, and
the bridge refuses an invalid config with the reason.

**See the expected behaviour without hardware.** The app's demo mode ("Try the demo" on the
Connect screen, also in the web pult) runs a simulated installation in-process (`packages/sim`):
the same bridge core and protocol, with a pretend installation that does what yours should — it
echoes every value on its own address, sends `/sys/fps` (~60) once a second and an audio level ten
times a second, handles `/otakoyi/*`, and confirms prompts by echoing their text.

**Brand assets and the loading screen** (set by the studio, ADR-004). After pairing, the app shows
a client-branded loading screen while it connects: `theme.splash` (full-screen image) with
`theme.logo` on it. Both are an http(s) URL or a path relative to the config's asset bundle; the
bridge serves the bundle from `assets/` next to the config file at `/brand/<path>` (images only,
`--assets` overrides the folder). Without `splash` the screen uses the plain background.

```json
"theme": { "mode": "dark", "primary": "#8DFF2E", "logo": "logo.png", "splash": "lobby.jpg" }
```

**Pad sizes and picture pads** (Figma `Size`, `Content=Image`). Pads (`button`, `toggle`) take
`size: "regular"` (150×88 pt) or `"compact"` (104×64 pt); without `size` a pad fills its grid cell.
A toggle with `image` is a **picture pad**: a square (168 pt regular / 120 pt compact) showing the
image, the label bottom-left on a legibility gradient; off dims the picture, on adds the lit ring
and LED. `image` is resolved like the brand assets (bundle path → `/brand/<path>`, or a URL).
Knobs take `size: "compact"` for a ~0.7× dial (labels stay the same size). Sizes change nothing on
the wire. A page whose rows would squeeze a picture pad or a sized pad below its size is split onto
another screen.

```json
{ "id": "visual", "type": "toggle", "label": "Visual", "address": "/live/visual", "image": "visual.jpg" },
{ "id": "flash", "type": "button", "label": "Flash", "address": "/fx/flash", "size": "compact" },
{ "id": "zoom", "type": "knob", "label": "Zoom", "address": "/fx/zoom", "size": "compact" }
```

## 6. Write the OSC contract

Add **`otakoyi/osc-contract.json`** to your installation repo. It is the agreement between your
project and the pult. It lists every parameter you accept, every value you report back and the
system actions you support. The studio designs the Figma pult from it, and the exporter checks
that each control address exists in the contract.

- Format: [`docs/osc-contract.schema.json`](osc-contract.schema.json) (JSON Schema).
- Example: [`docs/examples/osc-contract.example.json`](examples/osc-contract.example.json), which
  matches the TouchDesigner test patch.

Rules:

- Every address your OSC In reacts to appears in `parameters`, with its type, range, default and
  a human label. The label is a suggestion; final copy lives in Figma.
- Every address you send back appears in `telemetry` (or set `feedback: true` on the parameter
  when you echo it).
- A colour is either one `color` parameter with `colorFormat: "hsb"` (the default; you accept
  `<address>/h`, `/s`, `/b`, and `hueRange` says degrees or 0–1) or, for the single-message
  formats, `colorFormat` `hsvFloat` / `rgbFloat` / `rgbInt` / `hex` on the address itself.
- `hint` suggests a control (`fader`, `knob`, `xy`, `toggle`, `button`, `holdToConfirm`,
  `segmented`, `sceneList`, `colorPicker`, …). The studio may choose another. Destructive actions
  get `"dangerous": true`; the studio then uses hold-to-confirm.
- `actions` lists which of `flash`, `restart`, `blackout`, `idle`, `pause` you handle.

## 7. Hand back to the studio

1. `otakoyi/osc-contract.json` (valid against the schema).
2. The draft config you tested with (optional, but it speeds up the Figma layout).
3. Software and version (e.g. TouchDesigner 2025.x), project file, OS of the installation machine.
4. Notes on anything unusual: several machines, a browser engine, parameters that must never change
   during a show.

Do **not**:

- design the pult layout in the config, because Figma owns layout and copy;
- put secrets (PINs, keys) in the contract or the config;
- open PRs on this repo from an installation task unless the studio asked for it. A missing control
  type is a request to the studio (it becomes schema + logic + component + tests in one PR here).

## Reference

| Topic                              | Where                                            |
| ---------------------------------- | ------------------------------------------------ |
| Decisions (why things are so)      | `docs/decisions/README.md`                       |
| Config schema                      | `packages/schema/src/index.ts`, `examples/`      |
| Wire format per control            | `packages/controls/src/logic.ts` (`messagesFor`) |
| Pult ↔ bridge protocol (WebSocket) | `packages/protocol/src/index.ts`                 |
| Bridge system OSC, lease, logging  | `packages/bridge-core/src/bridge.ts`             |
| Simulated installation (demo)      | `packages/sim/src/simulator.ts`                  |
| Figma file and conventions         | `docs/figma.md`                                  |
| Working on this repo itself        | `AGENTS.md`                                      |
