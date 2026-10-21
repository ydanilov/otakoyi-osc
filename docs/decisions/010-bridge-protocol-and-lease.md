# 010 — Bridge protocol and lease

**Status:** Accepted

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
