# Otakoyi Control — agent guide

Branded OSC controller for the studio's generative installations. The studio builds a pult (control
surface) per installation; the client logs in with the installation's login and gets that pult on iOS
(Android later) or in a browser. Commands go to TouchDesigner (or any OSC software) on Windows, macOS
or Linux through a bridge on the installation computer.

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
| Tests         | Vitest                                                                          |

## Commands

```bash
pnpm install
pnpm tokens          # regenerate packages/tokens/generated/*
pnpm verify          # tokens check, format, types, unit tests
pnpm --filter @osc/mobile start       # Expo dev server
pnpm --filter @osc/mobile build:web   # web pult → apps/mobile/dist
```

Run `pnpm verify` before every commit.

## Hard rules

1. **Tokens only.** Colours, spacing, radii and type come from `@osc/tokens`. Skia controls read
   `useTheme()`; NativeWind classes use the semantic names (`bg-primary`, `text-muted-foreground`,
   `bg-status-online`). Never hardcode hex in components.
2. **Brand ≠ status.** A client brand overrides `primary`, `accent`, neutrals, font and logo only.
   Status colours (online, warning, critical, offline, studio) are never brandable.
3. **The pult never scrolls vertically.** Rows fill the screen height; pages that do not fit are split
   into screens that swipe horizontally (`paginate` in `packages/ui/src/pult/layout.ts`).
4. **Config, not code, defines a pult.** New pults ship as config revisions, never as app releases.
   A new control type = schema entry + logic + component + tests, in one PR.
5. **Platform code behind interfaces.** UDP/TCP, discovery and keep-awake live behind TS interfaces;
   no `Platform.OS` checks in business logic. Android must keep compiling even though it is not shipped.
6. **Logic is unit-tested.** Anything that decides what is sent (mapping, throttling, messages,
   layout) lives in pure TS and has tests. Components only draw and forward gestures.
7. **No editor in the client app.** Only the studio edits pults, in the builder.
8. **Expo changes every SDK.** Read the versioned docs before touching Expo or RN APIs; install native
   packages with `npx expo install`. See `apps/mobile/AGENTS.md`.

## Workflow

1. Branch `feat/<slug>` / `fix/<slug>`, conventional commits.
2. `pnpm verify` green.
3. PR; Yura reviews and merges. Never push to `main` without explicit approval.

## Where things live

```
apps/mobile/            Expo app (iOS now, Android later) + web pult build
packages/osc-core/      OSC codec
packages/schema/        installation config schema + examples/demo-installation.json
packages/tokens/        base tokens, createTheme(brand), contrast checks, generated CSS/preset
packages/controls/      control logic (pure TS)
packages/ui/            design system: Reusables components, Skia controls, pult renderer
docs/decisions/         ADRs — propose a new one instead of relitigating
td/                     TouchDesigner test project
```
