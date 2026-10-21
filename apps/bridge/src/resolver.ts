import type { Target } from "@osc/schema";

/** A service found on the local network. */
export interface FoundService {
  name: string;
  /** IPv4 / IPv6 addresses the service announced. */
  addresses: string[];
  port: number;
}

/** mDNS browse for `type` (e.g. "_osc._udp"), collecting for `ms`. Injected so tests need no network. */
export type Browse = (
  type: { name: string; protocol: "udp" | "tcp" },
  ms: number,
) => Promise<FoundService[]>;

export interface Resolved {
  host: string;
  port: number;
  /** Where the host came from. */
  via: "config" | "mdns" | "fallback" | "local";
}

const LOCAL = "127.0.0.1";
const BROWSE_MS = 1500;

const ipv4First = (addrs: string[]) =>
  addrs.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) ?? addrs[0];

/**
 * Where a target lives (ADR-016). A fixed `host` is used as is. `host: "auto"`:
 * 1. mDNS browse of `_osc._udp` (or `_osc._tcp` for TCP targets); `discovery.name` picks a service,
 *    otherwise the first one found;
 * 2. otherwise the `fallbackHosts`, in order;
 * 3. otherwise this machine (127.0.0.1).
 * When the target goes offline the server calls `next()`: browse again and, if mDNS still finds
 * nothing, move on to the next candidate, so a moved or replaced machine is picked up.
 */
export class HostResolver {
  private state = new Map<string, { resolved: Resolved; index: number }>();

  constructor(private browse: Browse | null) {}

  /** Current address (never waits; before the first resolve an auto target uses its first candidate). */
  current(t: Target): Resolved {
    if (t.host !== "auto") return { host: t.host, port: t.port, via: "config" };
    return this.state.get(t.id)?.resolved ?? this.candidate(t, 0);
  }

  /** Resolve an auto target now (mDNS first). */
  async resolve(t: Target): Promise<Resolved> {
    if (t.host !== "auto") return this.current(t);
    const index = this.state.get(t.id)?.index ?? 0;
    const found = await this.find(t);
    const resolved = found ?? this.candidate(t, index);
    this.state.set(t.id, { resolved, index });
    return resolved;
  }

  /** The target stopped answering: browse again, else try the next fallback. */
  async next(t: Target): Promise<Resolved> {
    if (t.host !== "auto") return this.current(t);
    const prev = this.state.get(t.id);
    const found = await this.find(t);
    if (found) {
      this.state.set(t.id, { resolved: found, index: prev?.index ?? 0 });
      return found;
    }
    // Leaving mDNS for the fallbacks starts at the first one; otherwise advance.
    const index = prev && prev.resolved.via !== "mdns" ? prev.index + 1 : 0;
    const resolved = this.candidate(t, index);
    this.state.set(t.id, { resolved, index });
    return resolved;
  }

  private candidate(t: Target, index: number): Resolved {
    const list = [...t.fallbackHosts, LOCAL];
    const host = list[index % list.length]!;
    return {
      host,
      port: t.port,
      via: host === LOCAL && index % list.length === list.length - 1 ? "local" : "fallback",
    };
  }

  private async find(t: Target): Promise<Resolved | null> {
    if (!this.browse) return null;
    let services: FoundService[] = [];
    try {
      services = await this.browse({ name: "osc", protocol: t.protocol }, BROWSE_MS);
    } catch {
      return null;
    }
    const wanted = t.discovery?.name;
    const s = wanted ? services.find((x) => x.name === wanted) : services[0];
    const host = s && ipv4First(s.addresses);
    return s && host ? { host, port: s.port || t.port, via: "mdns" } : null;
  }
}
