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

## Known issue

The simulated audio level sometimes repeats one value instead of moving (seen on macOS with the
timeline paused). Real feedback (echoed values, FPS) is unaffected. To look at next.
