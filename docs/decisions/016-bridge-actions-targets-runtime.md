# 016 — Bridge: installation actions, activity, targets and the runtime

**Status:** Accepted

## Context

ADR-013 puts installation actions (Flash, Restart, Blackout, Idle, optional Pause) and an
activity view in the Installation drawer. ADR-005 / 010 left TCP and `host: "auto"` targets open,
and ADR-011 needs the bridge to start and watch TouchDesigner and ship as one program.

## Decision

### Protocol v2

`PROTOCOL_VERSION = 2`, `MIN_PROTOCOL_VERSION = 1`: v2 only adds messages and fields, so v1 pults
keep connecting. New client messages: `action {name: flash|restart|blackout, on?}` (blackout needs
`on`) and `mode {mode: idle|pause, on}`. New server messages and fields:

| Message                                    | When                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `welcome.actions`, `.modes`, `.activity`   | supported actions, latched `{blackout, idle, pause}`, last 50 entries |
| `status.modes`                             | with every status broadcast (and when a mode changes)                 |
| `activity {entries}`                       | new activity, batched once a second                                   |
| `prompt {pult, id, state, seq}`            | prompt confirmation: `applying` → `applied` / `error`                 |
| `data {pult, id, kind: prompts \| images}` | presets or image library changed on the bridge: fetch again           |
| error `unsupported`                        | action / mode not in `installation.actions`                           |

### Installation actions

- Config: `installation.actions` (optional) ⊆ flash, restart, blackout, idle, pause; default
  flash, restart, blackout, idle. Only the lease holder or the studio may trigger them; every one is
  logged. Restart and Blackout ask for hold-to-confirm on the pult.
- System OSC to every target: `/otakoyi/flash`, `/otakoyi/restart`, `/otakoyi/blackout i 0|1`,
  `/otakoyi/idle i 0|1`, `/otakoyi/pause i 0|1`. Latched modes are re-sent when a target comes back
  online. Restart also goes through the supervisor when one runs.

### Activity

A ring buffer of the last 200 log entries (connect, disconnect, set, lease, action, mode, prompt,
image, pairing, rejected); a burst of `set`s on one control by one device within 2 s is one entry.
`GET /api/activity?limit=` needs the PIN or the studio key.

### Targets

- **Heartbeat**: the bridge sends `target.heartbeat` (default `/sys/ping`, `false` = off) once a
  second. Any feedback counts as alive (online = feedback within 5 s) and is passed to the
  supervisor. `/api/health` lists per target `lastSeen`, protocol, host, port and how it was found.
- **TCP**: OSC 1.1 with SLIP framing, one connection per target, feedback read on the same socket,
  reconnect with backoff (0.25 s → 10 s), at most 64 messages queued while disconnected.
- **`host: "auto"`**: mDNS browse of `_osc._udp` / `_osc._tcp`, `discovery.name` picks a service
  (else the first); otherwise `fallbackHosts` in order, then 127.0.0.1. When the target goes
  offline it is re-resolved (browse again, else the next candidate).

### Prompt confirmation and preset lifecycle

- After a prompt is sent it is **Applying** until the installation confirms — an echo of the text
  on `<address>` / `<address>/a` / `<address>/b`, or `<address>/applied` — and **Error** after the
  control's `confirmMs` (default 4000; 0 = applied at once). Retrying sends the same value again
  with a new `seq`. The value carries the live preset ids (`aId`, `bId`).
- Presets: create, update, duplicate, persisted reorder (`PUT /api/prompts/order`), soft delete
  restorable for 30 s (`POST /api/prompts/<id>/restore`, 410 after) — the pult shows Undo for 5 s.
  Editing, switching off or deleting a live preset re-sends the control (deleted → empty slot, the
  installation's base look). All lease-checked, logged and announced with `data`.

### Runtime (ADR-011)

- `ProcessSupervisor`: `runtime.app` touchdesigner / touchplayer (standard install paths on
  Windows / macOS, or `runtime.executable`) with `runtime.project`, or a `command`. Restarts on
  crash and on hang (no feedback for `hangTimeoutS`, default 15, after `startupGraceS`, default 60)
  with backoff 1 s → 60 s, reset after a stable minute. Perform mode: TouchPlayer always;
  TouchDesigner gets `OTAKOYI_PERFORM=1` (it has no command-line switch) and the project switches
  itself. The bridge starts it when a target has `runtime` (`OTAKOYI_SUPERVISE=0` disables).
- Single binary: `pnpm --filter @osc/bridge build:bin [--web]` (Node SEA). It reads
  `installation.json`, `web/`, `logs/`, `data/` next to itself. Built per OS on that OS.

## Consequences

- The app's Installation panel (ADR-013) uses all of it: quick actions, modes, the activity feed,
  and `/api/health` for its stats (`devices`, `uptimeS`, `fps` — the last `/sys/fps`).
- The core (`Bridge`, `Lease`, `PromptStore`) lives in `packages/bridge-core` without Node APIs, so
  the demo installation (`packages/sim`, ADR-012) runs the same code in the app.
- TouchDesigner projects should answer `/sys/ping` (or send anything) and handle `/otakoyi/*`;
  `tools/touchdesigner` shows how.
- Code signing, installers and the TD silent install stay with the packaging phase.
