# Otakoyi Control

Branded OSC controller for generative installations. The studio builds a pult per installation;
the client logs in and controls it from an iPhone, an iPad or a browser.

- `apps/mobile` — Expo app (iOS first) and the web pult
- `packages/*` — OSC codec, config schema, tokens, control logic, design system

```bash
pnpm install
pnpm verify
pnpm --filter @osc/mobile start
```

Start with [AGENTS.md](AGENTS.md) and [docs/decisions](docs/decisions/README.md).
