# TouchDesigner pieces

| Piece                                                        | What it is                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [`otakoyi_contract`](#contract-component-otakoyi_contract)   | **Every installation drops this in**: contract generator + generic OSC receiver |
| [`otakoyi_pairing.tox`](#pairing-overlay-otakoyi_pairingtox) | pairing card (QR + PIN) on the installation's own output                        |
| [`otakoyi_test.tox`](#touchdesigner-test-target)             | a patch that behaves like an installation, for testing the app and the bridge   |

Studio rules for TD projects (folders, relative paths, tags, adaptive output) live in
`ydanilov/otakoyi-td-template`; this folder is only the pult side.

## Contract component (`otakoyi_contract`)

Built by `build_otakoyi_contract.py`; the logic that decides anything is pure Python in
`otakoyi_contract_core.py` (tested outside TD: `python3 tools/touchdesigner/test_otakoyi_contract_core.py`,
also run by `pnpm verify`, together with the real Custom Parameters of The Whale in
`fixtures/the-whale-pars.json`). The core's text is embedded in the COMP, so a saved `.tox` has
no file references.

```python
# Textport, in the installation project
HERE = '/path/to/otakoyi-osc/tools/touchdesigner'
exec(open(HERE + '/build_otakoyi_contract.py').read())
build_contract_comp(op('/project1'), op('/project1/<your COMP>'), pairing=op('/project1/otakoyi_pairing'))
```

Then save the COMP as `otakoyi/otakoyi_contract.tox` in the installation repo (or keep it in the
`.toe`), pulse **Generate** and commit `otakoyi/osc-contract.json`.

| Parameter (page Otakoyi)        | Default                        |                                                                |
| ------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Target                          | —                              | the COMP with the tagged Custom Parameters                     |
| Installid, Installname, Usecase | from the project name, `lobby` | contract `installation`                                        |
| Inport                          | 7000                           | OSC In from the bridge                                         |
| Feedbackhost, Feedbackport      | 127.0.0.1, 9000                | feedback to the bridge                                         |
| Contractfile                    | `otakoyi/osc-contract.json`    | relative to `project.folder`                                   |
| Pairing                         | —                              | the `otakoyi_pairing` COMP; `/otakoyi/pair` is forwarded to it |
| Active                          | on                             | off: ignores OSC and sends nothing (e.g. while editing)        |
| Generate                        | pulse                          | writes the contract; warnings go to the `report` table         |

**Contract** (from the target's Custom Parameters, page by page):

| TouchDesigner                        | Contract                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| page                                 | `group`; page `System` → the standard System group (below)                   |
| label                                | `label`                                                                      |
| help text after the tags             | `description`                                                                |
| `[live]` `[tune]` `[setup]` `[hide]` | `priority` `live` / `tune` / `setup` / `hidden` (untagged → `tune`, warning) |
| `[danger]`                           | `dangerous: true`                                                            |
| Float, Int, Toggle, Pulse            | `float`, `int`, `bool`, `trigger`                                            |
| Menu                                 | `enum` with `options` (menu names → values, labels → labels)                 |
| RGB, XY                              | `color` (`colorFormat: rgbFloat`, one message `r g b`), `xy`                 |
| Str                                  | `string`                                                                     |
| normMin / normMax, default           | `min` / `max`, `default`                                                     |
| position on the page                 | `order`                                                                      |
| name                                 | address `/<page>/<name>`, lowercase                                          |

- Page **`System`**: exactly `Resw`, `Resh`, `Debug` (legacy name `Rehearsal`) and `Seed` →
  `/system/resw`, `/system/resh`, `/system/debug`, `/system/seed` (ADR-018). Anything else on that
  page is left out with a warning.
- Parameters named **`Idle`**, **`Pause`** and **`Restart`** (any page) are not parameters: they
  implement the bridge's system actions, and the contract's `actions` lists the ones that exist
  (plus `flash` and `blackout`, which the component does itself).
- File, folder and other styles without an OSC type are left out with a warning.

**Receiver** (the same COMP, while `Active`):

| Bridge sends                  | Component does                                                        |
| ----------------------------- | --------------------------------------------------------------------- |
| a contract address            | sets the parameter (pulse for triggers; RGB / XY set the whole tuple) |
| `/otakoyi/pair …`             | forwards to `Pairing`                                                 |
| `/otakoyi/flash`              | its overlay output turns white for 150 ms                             |
| `/otakoyi/blackout 0\|1`      | its overlay output is black while 1                                   |
| `/otakoyi/idle 0\|1`, `pause` | sets the target's `Idle` / `Pause` toggle, if it has one              |
| `/otakoyi/restart`            | pulses the target's `Restart`, if it has one                          |
| `/sys/ping`                   | answers `/sys/pong`                                                   |

Every change of a contract parameter, from the pult or made in TD, is echoed to the bridge on its
address (Parameter Execute DAT); `/sys/fps` goes out once a second. `/otakoyi/*` is never echoed.
Composite the COMP's output (transparent unless flash / blackout) over your final output, under the
pairing overlay. The overlay takes its size from the target's `Resw` / `Resh`.

> No `otakoyi_contract.tox` is committed yet: a binary `.tox` cannot be generated outside
> TouchDesigner. Build it once from the script in TD and save it here as `otakoyi_contract.tox`;
> rebuild and save again whenever the script or the core changes.

## TouchDesigner test target

A small TouchDesigner patch that behaves like an installation, so the app and the bridge can be tested
against real TD instead of a simulation. Same addresses as the demo config
(`design-system/packages/schema/examples/demo-installation.json`).

|              |                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| OSC in       | UDP **7000** (`/wall/intensity`, `/wall/hue`, `/scene`, `/cue/{n}`, …)                                                              |
| Feedback out | UDP **9000** on 127.0.0.1 — every received message is echoed back, plus simulated `/wall/audio/level` (10 Hz) and `/sys/fps` (1 Hz) |
| Inside       | `/project1/otakoyi`: `osc_in` → `values` table → preview TOP (brightness, hue, tint, blackout)                                      |
| Colour       | the tint arrives as three addresses, `/wall/tint/h` (°), `/wall/tint/s`, `/wall/tint/b` (0..1), each only when it changes; echoed   |
| System OSC   | `/otakoyi/*` and `/sys/ping` from the bridge go to the `system` table (see below), never echoed                                     |

### Installation actions and heartbeat (ADR-016)

The bridge sends these to every target; the patch answers like a real installation should:

| Bridge sends                | Patch does                                                                 |
| --------------------------- | -------------------------------------------------------------------------- |
| `/otakoyi/flash`            | full-white frame for 150 ms                                                |
| `/otakoyi/blackout 0\|1`    | black output while 1                                                       |
| `/otakoyi/idle 0\|1`        | dims to 25 % ("not reacting to people"), shows IDLE                        |
| `/otakoyi/pause 0\|1`       | holds the last frame, shows PAUSE (only if the config lists `pause`)       |
| `/otakoyi/restart`          | logs it; the real restart is done by Otakoyi Runtime's supervisor          |
| `/sys/ping` (1 Hz)          | answers `/sys/pong` (any feedback marks the target online in the bridge)   |
| prompt `/…/a`, `/…/b`, `/…` | echoed like every message, which is what confirms a prompt (Applying → On) |

Blackout, idle and pause are re-sent by the bridge whenever the target comes back online, so a
restarted project picks up the current state. When the supervisor starts TouchDesigner it sets
`OTAKOYI_PERFORM=1`; the patch's `on_start` switches to perform mode then (TouchDesigner has no
command-line switch for it; TouchPlayer always runs in perform mode).

> `otakoyi_test.tox` in this folder predates these changes: rebuild it from
> `build_otakoyi_test.py` in TouchDesigner and save the COMP over the .tox (it is a binary file and
> cannot be regenerated without TD).

### Use it

Either drag `otakoyi_test.tox` into a network, or build it from the script (Dialogs → Textport):

```python
exec(open('/path/to/otakoyi-osc/tools/touchdesigner/build_otakoyi_test.py').read())
```

Then run the bridge on the same machine:

```sh
pnpm install
pnpm --filter @osc/mobile build:web      # web pult served by the bridge
OTAKOYI_PIN=2468 pnpm bridge             # http://localhost:8080  (PIN 2468)
```

Open http://localhost:8080 — the header turns **Online** when feedback from TD arrives.
Set `OTAKOYI_DEBUG=1` to log every OSC packet in and out.

## Pairing overlay (`otakoyi_pairing.tox`)

Reusable component for every installation project (ADR 012): while the bridge is in pairing mode the
installation's own output shows a full-frame card — QR for the app, PIN, web pult address and a
countdown. It is transparent otherwise.

- **Start / stop pairing:** Ctrl+Shift+P on the installation machine (any keyboard layout; in the TD
  editor use Perform mode or F12), or the studio from its pult. Closes by itself after 2 minutes.
- **Why not always on:** the PIN on a public screen lets anyone on the Wi-Fi take control.
- **Wiring:** forward `/otakoyi/*` from your OSC In callback to
  `op('otakoyi_pairing/logic').module.handle(address, args)` (and don't echo them), then put the COMP's
  output over your final output. The bridge draws the card (`/pair.png?card=1`), TD only adds the text.
- Rebuild from source: `build_otakoyi_pairing.py` (`build_pairing(parentComp)`).

### Telemetry

Simulated audio level and FPS run on their own timer (`run()` on TDResources), so they keep moving
with the timeline paused.
