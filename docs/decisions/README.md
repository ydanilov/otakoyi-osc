# Architecture decision records

Short, numbered, immutable. To change a decision, add a new ADR that supersedes the old one.

| #   | Decision                                                                     | Status   |
| --- | ---------------------------------------------------------------------------- | -------- |
| 001 | One app in the store; a client "build" is a config revision, not a binary    | Accepted |
| 002 | Expo / React Native + TypeScript monorepo                                    | Accepted |
| 003 | iOS first; Android kept compiling behind platform interfaces                 | Accepted |
| 004 | Design system: React Native Reusables + NativeWind for chrome, Skia controls | Accepted |
| 005 | Bridge is the hub: shared state, control lease, local web pult, OSC fan-out  | Accepted |
| 006 | Pult never scrolls vertically; pages split into horizontally swiped screens  | Accepted |
| 007 | Relative faders by default; fine mode and double-tap reset on every slider   | Accepted |
| 008 | Control presets: built-in library + custom studio presets in the config      | Accepted |
| 009 | Value snapshots (client-saved looks) live in the bridge, not in the config   | Proposed |
| 010 | Bridge protocol: WebSocket JSON, bridge validates, sends OSC, owns the lease | Accepted |
| 011 | One program on site: Otakoyi Runtime = bridge + TD supervisor + project      | Accepted |
| 012 | Pairing by QR on the local network (deep link + web pult), mDNS advertise    | Accepted |

---

## 001 — Config, not binaries

**Status:** Accepted · 2026-10-21

**Decision.** One app (“Otakoyi Control”) in the App Store. After login the app downloads the
installation's config (JSON, zod-validated, `schemaVersion` + `revision`) and renders it from the
built-in control library. White-label binaries only as a paid exception.

**Consequences.** Pult changes ship in minutes without App Review. New control types need an app
release; older apps show an “Update the app” placeholder for unknown types and keep working.

## 002 — Expo / React Native

**Status:** Accepted · 2026-10-21

**Decision.** Expo SDK 58 with a development build (custom native modules), EAS Build for iOS (no Mac
needed), pnpm + Turborepo monorepo shared with the bridge and the builder.

**Consequences.** Same language as the studio site; web pult from the same code via react-native-web.
Native UDP/TCP needs an Expo module.

## 003 — iOS first

**Status:** Accepted · 2026-10-21

**Decision.** MVP ships on iOS via TestFlight, then the App Store. Android is a later phase: platform
code sits behind TS interfaces, every dependency must support Android, Android keeps compiling in CI.

## 004 — Design system

**Status:** Accepted · 2026-10-21

**Decision.** App chrome uses React Native Reusables (shadcn API, components copied into
`packages/ui`) on NativeWind. Continuous controls (fader, knob, XY, meter, hold ring) are custom Skia
components; discrete controls are Views. All read `@osc/tokens`; the client brand is applied at
runtime through `createTheme(brand)` and NativeWind `vars()`.

**Consequences.** Figma library mirrors these names. Status colours stay outside the brand layer.

## 005 — Bridge as hub

**Status:** Accepted · 2026-10-21

**Decision.** A bridge runs on every installation. Phones and browsers connect to it; it keeps the
shared control state, grants the control lease (one device controls, others view, the studio always
wins), logs commands, serves the local web pult and sends OSC to the installation. Direct OSC from the
phone is a fallback without sync or lease.

## 006 — No vertical scrolling

**Status:** Accepted · 2026-10-21

**Decision.** Grid rows stretch to the screen height. A page that does not fit at the minimum row
height (40 pt) is split into screens between bands of controls; screens swipe horizontally with tabs.
Phones re-flow the tablet grid into half/full-width controls.

## 007 — Relative faders by default

**Status:** Accepted · 2026-10-21

**Context.** Research (TouchOSC, Open Stage Control): absolute faders jump to the finger, so an
accidental touch in a dark venue can flash or kill a wall.

**Decision.** Faders default to `response: "relative"` — a touch never changes the value; dragging moves
it 1:1 with the track. `absolute` is opt-in per control. Faders and knobs share: two-finger fine mode
(`fineFactor`, ×0.2), shown as FINE; double-tap resets to `default` (`doubleTapReset`). Adding or lifting
a finger re-anchors the drag, so the value never jumps.

## 008 — Control presets

**Status:** Accepted · 2026-10-21

**Decision.** A control may reference `preset`. Built-in presets ship in `packages/schema/src/presets.ts`
(ids `type/name`, e.g. `fader/brightness`). Custom presets are saved by the studio in the builder and
published in the config's `presets`, so the app works offline. Preset fields are merged under the
control's own fields before validation; explicit fields win. Unknown presets, type mismatches and
custom ids that clash with built-ins fail validation. Clients do not create presets (only the studio
edits pults).

## 009 — Value snapshots (reserved, not in MVP)

**Status:** Proposed · 2026-10-21

**Context.** Clients will want to save the current look ("evening, warm, 40 %") and recall it with one
tap. That is different from a control preset (ADR 008): a preset is a control's settings, a snapshot is
the values of many controls at a moment.

**Decision.** Not built now; the architecture keeps it possible:

- A snapshot is `ValueSnapshot` in `@osc/schema`: `{ id, pultId, label, values: { controlId: value },
createdBy: "client" | "studio", createdAt, configRevision }`.
- Snapshots are installation **state**, not config: the bridge stores them next to the shared control
  state. Saving one never touches the studio's config, so ADR 001 and "only the studio edits pults"
  still hold.
- Recalling a snapshot is an ordinary control change: it needs the control lease, goes through the
  same `PultStore` path (one batch of `set`s → OSC), is logged and synced to every device.
- Recall skips controls that no longer exist or whose value no longer validates (config changed since
  `configRevision`), and never includes `studioOnly`, `holdToConfirm` or display-only controls.
- The studio switches it on per installation (a config flag, default off) when the feature ships.

**Consequences.** `PultStore` keeps values as a plain `controlId → value` map so it can be exported and
applied in one batch; the bridge state store must allow a second collection besides live values.

## 010 — Bridge protocol and lease

**Status:** Accepted · 2026-10-21

**Decision.** Pults talk to the bridge over one WebSocket (`/ws`, JSON, `@osc/protocol`, version 1):
`hello` → `welcome` (config, full state, lease, target status), then `set` / `take` / `release`;
the bridge broadcasts `value`, `lease` and `status`. The bridge is the authority: it validates every
`set` against the control (`coerceValue`: clamps ranges, rejects unknown scenes, never lets a device
drive a meter or label), sends the OSC, logs the command (JSONL) and syncs the value to every other
device. Lease: the first client gets it; a client may take it from a client; the studio takes it from
anyone; when the holder leaves it goes to the longest-connected client. Local clients authenticate with
the installation PIN, the studio with its key (no key configured = studio refused). The bridge also
serves the web pult on `/` and `/api/health`, and ships as one file (`pnpm --filter @osc/bridge bundle`).

**Consequences.** One code path for every device; the phone never sends OSC itself when a bridge is
present. Target "auto" (mDNS) and TCP targets are not implemented yet: "auto" means this machine.

## 011 — One program on the installation machine: Otakoyi Runtime

**Status:** Accepted · 2026-10-21 · not built yet (native packaging is a later phase)

**Context.** A client must not run "the installation" and "the bridge" as two programs. TouchDesigner
cannot export a standalone .exe/.app: a project (.toe) runs in TouchDesigner or TouchPlayer (perform
mode, no editor), and the machine needs a TouchDesigner licence. Projects can be packed into the .toe
with TD's virtual file system (VFS).

**Decision.** The client gets one installer and sees one program, **Otakoyi Runtime** (macOS .pkg,
Windows installer), which contains:

- the bridge, compiled to a native binary (no Node on the machine);
- the installation project (.toe, assets packed with VFS where possible);
- a supervisor in the bridge process that starts TouchDesigner/TouchPlayer with the project in perform
  mode, watches it (heartbeat over OSC, process alive), restarts it on a crash, and runs the schedule;
- the pult web app and the pairing page (`/pair`).

The installer installs the matching TouchDesigner build (silent install) and the licence key, registers
the runtime as a service (launchd / Windows service) so it starts with the machine, and opens the
pairing page once. The runtime reports TD status to the studio (telemetry) like any target.

**Consequences.** The bridge grows a "process supervisor" module behind an interface (no TD specifics in
the core). TD version and licence become part of the installation record. Code signing (Apple
Developer ID, Windows code signing) is required before shipping to clients. Until then the studio
installs TD and the bridge by hand.

## 012 — Pairing by QR on the local network

**Status:** Accepted · 2026-10-21

**Decision.** The bridge serves `/pair` (only to its own machine, since it shows the PIN) with two QR
codes per network address: the app deep link `otakoyi-control://connect?bridge=ws://…/ws&pin=…&name=…`
and the web pult URL. Scanning with the phone camera opens the app, which stores the pairing (Keychain
via SecureStore) and connects. The bridge also advertises `_otakoyi._tcp` over mDNS for in-app discovery
later. Cloud login with a one-time magic link replaces the PIN when the cloud exists; a magic link can
not survive an App Store install, so the first screen also accepts the QR.
