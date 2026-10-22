# Otakoyi Control

Branded OSC controller for Otakoyi's generative installations. The studio designs a pult per
installation in Figma; the client pairs a phone or tablet with the installation and controls it
from the app (iOS first) or a web pult in the browser. A small bridge on the installation machine
turns that into plain OSC for TouchDesigner or any other OSC software.

## Where to start

| You are…                                                                                    | Read                                         |
| ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Working on an installation** (TouchDesigner, browser engine, …) that must be controllable | [docs/integration.md](docs/integration.md)   |
| Working on this repo (app, bridge, schema, design system)                                   | [AGENTS.md](AGENTS.md)                       |
| Looking for why something is the way it is                                                  | [docs/decisions](docs/decisions/README.md)   |
| Designing in Figma                                                                          | [docs/figma.md](docs/figma.md)               |
| Exporting a client page from Figma to a config (CLI, Otakoyi Inspector plugin)              | [docs/figma-export.md](docs/figma-export.md) |

## How it fits together

```
Figma page per client ──exporter──▶ config JSON
                                        │
iPhone / iPad / browser ◀──WebSocket──▶ bridge (installation machine)
                                        │ OSC/UDP :7000      ▲ feedback :9000
                                        ▼                    │
                              TouchDesigner / any OSC software
```

- `apps/mobile` — Expo app (iOS first) and the web pult
- `apps/bridge` — the bridge: WebSocket for pults, OSC to the installation, lease, log, pairing
- `packages/*` — OSC codec, config schema, protocol, tokens, control logic, design system
- `tools/figma-export` — the exporter: Figma client page → installation config + report
- `tools/figma-plugin` — Otakoyi Inspector, the studio's Figma dev plugin (annotations, preview)
- `tools/touchdesigner` — reference TouchDesigner target and the pairing overlay `.tox`
- `docs/osc-contract.schema.json` — what an installation declares it accepts over OSC

```bash
pnpm install
pnpm verify
pnpm --filter @osc/mobile build:web && OTAKOYI_PIN=2468 pnpm bridge   # http://localhost:8080
```
