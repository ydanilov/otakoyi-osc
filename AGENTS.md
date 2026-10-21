# Otakoyi Control — agent guide

Branded OSC controller for the studio's generative installations. The studio builds a pult (control
surface) per installation; the client pairs a device by scanning the installation's QR (no accounts, ADR-012) and gets that pult on iOS
(Android later) or in a browser. Commands go to TouchDesigner (or any OSC software) on Windows, macOS
or Linux through a bridge on the installation computer.

Two use cases (ADR-013): in a **lobby / permanent installation** the pult is a stylish, convenient
controller (usually a phone); at a **live event** it is a VJ console for that installation (usually a
tablet). Every delivery ships **both phone and tablet layouts**.

**Integrating an installation (TouchDesigner etc.) rather than working on this repo?** Read
[docs/integration.md](docs/integration.md) instead.

Read this file before every task. Humans own direction and approval; agents do the work between
checkpoints. Plan and business rules: Claude Doc "OSC Controller — план робіт і документація".

## Stack (see `docs/decisions/`)

| Layer         | Choice                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| App           | Expo SDK 58 (React Native 0.88, New Architecture), Expo Router, TypeScript      |
| App chrome    | React Native Reusables (shadcn for RN) + NativeWind 4, in `packages/ui`         |
| Controls      | Skia + Reanimated + Gesture Handler 3 for continuous controls, in `packages/ui` |
| Tokens        | `packages/tokens/tokens.json` → `pnpm tokens` → CSS vars + Tailwind preset      |
| Config        | zod schema in `packages/schema` (`schemaVersion`, revisions)                    |
| OSC           | Pure-TS codec in `packages/osc-core` (OSC 1.0/1.1, bundles, SLIP)               |
| Control logic | `packages/controls` — value mapping, throttling, messages per control           |
| Web pult      | The same app exported for web (`pnpm --filter @osc/mobile build:web`)           |
| Bridge        | `apps/bridge` (Node): WebSocket for pults, UDP OSC, lease, log; `@osc/protocol` |
| Bridge core   | `packages/bridge-core`: state, lease, actions, activity, presets — no Node APIs |
| Demo          | `packages/sim`: the bridge core in-process + a pretend installation (ADR-012)   |
| Tests         | Vitest; the web build driven in headless Chromium (Playwright) for the flows    |

## Commands

```bash
pnpm install
pnpm tokens          # regenerate packages/tokens/generated/*
pnpm verify          # tokens check, format, types, unit tests
pnpm --filter @osc/mobile start       # Expo dev server
pnpm --filter @osc/mobile build:web   # web pult → apps/mobile/dist
pnpm --filter @osc/mobile test        # app logic: session, loading, navigation, installation panel
pnpm --filter @osc/sim test           # simulated installation (demo mode)
OTAKOYI_PIN=2468 pnpm bridge           # bridge on :8080 (serves the web pult, OSC to the demo target)
pnpm --filter @osc/bridge bundle      # bridge as one file → apps/bridge/dist/bridge.mjs
pnpm storybook                        # component docs on :6006 (React Native Web + Vite)
pnpm build-storybook                  # static Storybook → apps/storybook/storybook-static
pnpm test-storybook                   # headless: every story × dark/light renders, play tests pass
# Control gallery (every control × state × brand): open /gallery in the web pult or the app
# Demo without hardware: open the web pult (or the app) → Connect → "Try the demo"
```

App flow (ADR-012, ADR-013): **Connect** (scan pairing QR / enter address and PIN / try the demo) →
client-branded **loading** screen → **pult**. No accounts and no login. Settings, Installation and
dialogs are sheets (iPad: Installation is a trailing inspector). The app talks to a real bridge or to
the in-app simulator through the same `TransportFactory` (`@osc/protocol`) and HTTP API shape
(`BridgeHttp`); `apps/mobile/src/lib/session.ts` holds what the bridge said.

## Storybook — the component docs

Storybook (`apps/storybook`) is the one home of component documentation; Figma keeps only a one-line
description. **Every component in `packages/ui` has a story**: `<Component>.stories.tsx` next to the
component, with `componentDocs()` (purpose, do/don't, anatomy, states, behaviour, accessibility,
content limits, Figma component + variant → props) and a story per state/variant; `play` tests where
interactive. Toolbar: theme, brand (Otakoyi + the two `/gallery` sample brands), phone/tablet
viewport. Guidelines, Introduction and Changelog are MDX in `apps/storybook/docs`; add a Changelog
entry with every design-system change.

Run `pnpm verify` before every commit.

## Hard rules

1. **Tokens only.** Colours, spacing, radii and type come from `@osc/tokens`. Skia controls read
   `useTheme()`; NativeWind classes use the semantic names (`bg-primary`, `text-muted-foreground`,
   `bg-status-online`). Never hardcode hex in components.
2. **Brand ≠ status.** A client brand overrides `primary`, `accent`, neutrals, font and logo only.
   Status colours (online, warning, critical, offline, studio) are never brandable.
3. **The pult never scrolls vertically.** (Sheets may: Settings, Installation, Activity.) Rows fill
   the screen height; pages that do not fit are split into screens that swipe horizontally
   (`paginate` in `packages/ui/src/pult/layout.ts`).
4. **Config, not code, defines a pult** — and the config is exported from Figma (ADR-014). New pults ship as config revisions, never as app releases.
   A new control type = schema entry + logic + component + tests, in one PR.
5. **Platform code behind interfaces.** UDP/TCP, discovery and keep-awake live behind TS interfaces;
   no `Platform.OS` checks in business logic. Android must keep compiling even though it is not shipped.
6. **Logic is unit-tested.** Anything that decides what is sent (mapping, throttling, messages,
   layout) lives in pure TS and has tests. Components only draw and forward gestures.
7. **No editor in the client app, no builder app.** Only the studio edits pults, in Figma (ADR-014).
8. **Expo changes every SDK.** Read the versioned docs before touching Expo or RN APIs; install native
   packages with `npx expo install`. See `apps/mobile/AGENTS.md`.

## Workflow

1. Branch `feat/<slug>` / `fix/<slug>`, conventional commits.
2. `pnpm verify` green.
3. PR; Yura reviews and merges. Never push to `main` without explicit approval.

## Where things live

```
apps/mobile/            Expo app (iOS now, Android later) + web pult build
  src/app/              routes: connect, manual, scan, loading, pult, settings, installation, dialog
  src/lib/              session, pairing storage, loading / navigation / installation logic (tested)
  src/components/ds/    local stand-ins for design-system components (TODO(ds) until they land)
apps/bridge/            the bridge program: sockets, UDP/TCP OSC, files, pairing page, runtime
packages/bridge-core/   the bridge's core (Bridge, Lease, PromptStore) — shared with packages/sim
packages/sim/           simulated installation for demo mode: transport, HTTP API, preview model
packages/protocol/      pult ↔ bridge protocol, transports, HTTP client, pairing links
packages/osc-core/      OSC codec
packages/schema/        installation config schema + examples/demo-installation.json
packages/tokens/        base tokens, createTheme(brand), contrast checks, generated CSS/preset
packages/controls/      control logic (pure TS)
packages/ui/            design system: Reusables components, Skia controls, pult renderer
  src/ds/               depth (Surface, boxShadow), Phosphor icons, LED, pure DS logic (+ tests)
  src/chrome|forms|containers|media|patterns/   DS components; stories next to each file
apps/storybook/         Storybook config, MDX docs (Introduction, Guidelines, Changelog)
docs/decisions/         ADRs, one file each, current version only — edit in place
tools/touchdesigner/     TouchDesigner test target + pairing overlay (.tox + build scripts)
docs/integration.md     how an installation project plugs in (OSC contract, feedback, system OSC)
docs/figma.md           Figma file, pages, components, conventions
```
