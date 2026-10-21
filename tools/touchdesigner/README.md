# TouchDesigner test target

A small TouchDesigner patch that behaves like an installation, so the app and the bridge can be tested
against real TD instead of a simulation. Same addresses as the demo config
(`packages/schema/examples/demo-installation.json`).

|              |                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| OSC in       | UDP **7000** (`/wall/intensity`, `/wall/hue`, `/scene`, `/cue/{n}`, …)                                                              |
| Feedback out | UDP **9000** on 127.0.0.1 — every received message is echoed back, plus simulated `/wall/audio/level` (10 Hz) and `/sys/fps` (1 Hz) |
| Inside       | `/project1/otakoyi`: `osc_in` → `values` table → preview TOP (brightness, hue, blackout)                                            |
| System OSC   | `/otakoyi/*` and `/sys/ping` from the bridge go to the `system` table (see below), never echoed                                     |

## Installation actions and heartbeat (ADR-016)

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

## Use it

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

## Telemetry

Simulated audio level and FPS run on their own timer (`run()` on TDResources), so they keep moving
with the timeline paused.
