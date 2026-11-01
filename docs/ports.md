# Ports and discovery

What the pult side uses on an installation machine. The registry of installations and their sensor
port blocks lives in one place, `otakoyi-td-template/docs/installations.md`; this page only states
the rules.

| Port / service  | Protocol        | Direction                          | Who                                                            | Where it is set                                          |
| --------------- | --------------- | ---------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| **8080**        | HTTP, WebSocket | pults → bridge                     | bridge: web pult, `/ws`, `/api/*`, pairing page, `/brand/*`    | `apps/bridge` (`--port`)                                 |
| **7000**        | OSC over UDP    | bridge → installation              | the installation's OSC In (TD: `otakoyi_contract`)             | config `targets[].port`, contract `osc.in`               |
| **9000**        | OSC over UDP    | installation → bridge (127.0.0.1)  | feedback: echo, `/sys/fps`, telemetry, `/otakoyi/pair/request` | config `targets[].feedbackPort`, contract `osc.feedback` |
| `_otakoyi._tcp` | mDNS / Bonjour  | bridge advertises                  | the app finds the bridge on the LAN                            | `apps/bridge`                                            |
| `_osc._udp`     | mDNS / Bonjour  | installation advertises (optional) | the bridge finds a target with `host: "auto"`                  | config `targets[].discovery`                             |
| **10000–10099** | OSC over UDP    | sensors → installation software    | cameras, trackers (never through the bridge)                   | `otakoyi-td-template/docs/installations.md`              |

## Rules

- **The bridge is the only sender to 7000** (ADR-005). Pults never talk OSC to the installation.
- **10000–10099 is reserved for sensors** that send OSC straight to the installation software
  (e.g. The Whale's MediaPipe tracker on 10000). One block of 10 per installation, assigned in
  `otakoyi-td-template/docs/installations.md` when the repo is created. Never use the block for the
  pult, and never send pult parameters to it.
- **Reserved OSC prefixes**: `/otakoyi/*` (system messages from the bridge), `/sys/*` (telemetry,
  heartbeat) and `/system/*` (the standard System group, ADR-018).
- **Several targets on one machine** (two installations, or two programs of one installation):
  one bridge, one target per program in the config. Each target gets its own OSC In port and its own
  feedback port, counting up from the defaults in pairs: 7000 / 9000, 7001 / 9001, 7002 / 9002.
  Two programs never share an OSC In port, and the bridge never shares a feedback port between
  targets (it tells targets apart by the port their feedback arrives on). Record the pairs next to
  the installation in the registry.
- **Several machines**: each machine runs its own installation software on 7000 / 9000; the config
  lists one target per machine by host. The bridge runs on one of them.
