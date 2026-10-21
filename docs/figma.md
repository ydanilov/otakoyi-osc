# Figma ↔ code

File: **OSC** — https://www.figma.com/design/D2HHS8lt7PxZqxibv9PlOQ/OSC

| Page          | What                                                                      | Code          |
| ------------- | ------------------------------------------------------------------------- | ------------- |
| Research      | UI/UX research board + screenshots by category                            | —             |
| Components    | Design-system library: app chrome and all 12 controls, bound to variables | `packages/ui` |
| Pult examples | Tablet (dark) and phone (light) pults built only from instances           | `apps/mobile` |

## Variables

| Collection  | Modes                     | Contents                                                                                  | Code                        |
| ----------- | ------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| `Base`      | Value                     | Neutrals for dark and light, status colours (hidden primitives)                           | `tokens.json → color`       |
| `Brand`     | one mode per client brand | `brand/primary`, `on-primary`, `primary-pressed`, `primary-subtle`, `accent`, `on-accent` | installation config `theme` |
| `Theme`     | Dark / Light              | Semantic: `color/*`, `control/*`, `status/*` — aliases to Base and Brand                  | `createTheme()` output      |
| `Dimension` | Value                     | `space/*`, `radius/*`, `stroke/*`, `touch/*`, `control/*` sizes                           | `tokens.json`               |

Web code syntax on Theme variables matches the CSS vars (`rgb(var(--primary))`, `--control-fill`, `--status-*`).
**Status colours live only in Base and are never aliased to Brand** — same rule as `checkBrand()` in code.
To preview a client: add a mode to `Brand`, set it on a frame. Derived brand values (`primary-pressed`,
`primary-subtle`) come from `createTheme()` — copy them from code rather than inventing them.

Text styles: `Display`, `Heading/XL`, `Heading/LG`, `Body/MD`, `Body/SM`, `Label/SM`, `Control/Label`
(uppercase, +8 %), `Control/Value` and `Control/Readout LG` (JetBrains Mono), `Badge`.

## Components

Chrome: `Button` (Primary / Secondary / Ghost / Destructive × Default / Disabled), `Badge`, `Connection`,
`Pult Select`, `Screen Tab`, `Pult Header` (Mode = Control / View / Studio).

Controls: `Fader` (Vertical / Horizontal × Default / Fine / Disabled), `Knob`, `XY Pad`, `Meter`
(Normal / Warning / Critical), `Toggle`, `Pad`, `Hold to Confirm` (Critical / Default × Idle / Holding / Done),
`Segmented`, `Button Grid`, `Scene List`, `Label` (MD / LG), `Color Picker`, `Unsupported Control`.
Each component's description carries the behaviour and the presets that use it.

Fader, XY Pad and Meter resize: the body fills the component and the shapes scale.

## Rules

- Component and variant names follow the code (`controlRegistry` types, ADRs).
- Colours only through Theme variables; a new colour starts in `tokens.json`, then here.
- The control drawing in code (Skia) is the source of truth for geometry; Figma mirrors it.
