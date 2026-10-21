# TouchDesigner test target

A small TouchDesigner patch that behaves like an installation, so the app and the bridge can be tested
against real TD instead of a simulation. Same addresses as the demo config
(`packages/schema/examples/demo-installation.json`).

|              |                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| OSC in       | UDP **7000** (`/wall/intensity`, `/wall/hue`, `/scene`, `/cue/{n}`, …)                                                              |
| Feedback out | UDP **9000** on 127.0.0.1 — every received message is echoed back, plus simulated `/wall/audio/level` (10 Hz) and `/sys/fps` (1 Hz) |
| Inside       | `/project1/otakoyi`: `osc_in` → `values` table → preview TOP (brightness, hue, blackout)                                            |

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
