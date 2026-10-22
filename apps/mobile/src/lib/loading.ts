import type { SessionError, SessionState } from "./session";

/** The branded loading screen stays at least this long, so it never flashes (no maximum). */
export const MIN_LOADING_MS = 600;
/** No welcome after this long: say so on the loading screen (and keep trying). */
export const UNREACHABLE_MS = 8000;

export type LoadingPhase =
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "error"; title: string; message: string; actions: LoadingAction[] };

export type LoadingAction = "retry" | "address" | "update";

/**
 * What the loading screen shows: the loader while the handshake runs (at least MIN_LOADING_MS),
 * then the pult, or an inline error with Retry / Enter address — never an alert (ADR-013).
 */
export function loadingPhase(o: {
  state: Pick<SessionState, "connection" | "config" | "error" | "welcomedAt">;
  startedAt: number;
  now: number;
  name: string;
  /** A demo has no address to type. */
  demo?: boolean;
}): LoadingPhase {
  const { state, startedAt, now, name } = o;
  if (state.error) return errorPhase(state.error, name, !!o.demo);
  const elapsed = now - startedAt;
  if (state.connection === "open" && state.config && elapsed >= MIN_LOADING_MS)
    return { phase: "ready" };
  if (elapsed >= UNREACHABLE_MS && !(state.connection === "open" && state.config))
    return errorPhase(
      { code: "unreachable", message: "No answer from the installation" },
      name,
      !!o.demo,
    );
  return { phase: "loading" };
}

/** How long until the phase can change by time alone (to schedule one re-render), or null. */
export function nextLoadingTick(startedAt: number, now: number): number | null {
  const elapsed = now - startedAt;
  if (elapsed < MIN_LOADING_MS) return MIN_LOADING_MS - elapsed;
  if (elapsed < UNREACHABLE_MS) return UNREACHABLE_MS - elapsed;
  return null;
}

function errorPhase(e: SessionError, name: string, demo: boolean): LoadingPhase {
  const address: LoadingAction[] = demo ? ["retry"] : ["retry", "address"];
  switch (e.code) {
    case "auth":
      return {
        phase: "error",
        title: "Wrong PIN",
        message: `${name} didn't accept the PIN. Enter the PIN shown under the pairing QR.`,
        actions: demo ? ["retry"] : ["address", "retry"],
      };
    case "version":
      return {
        phase: "error",
        title: "Update the app",
        message: `${name} needs a newer version of Otakoyi Control.`,
        actions: ["update", "retry"],
      };
    case "unreachable":
      return {
        phase: "error",
        title: `Can't reach ${name}`,
        message: "Check that this device is on the installation's Wi-Fi.",
        actions: address,
      };
    default:
      return {
        phase: "error",
        title: "Something went wrong",
        message: e.message,
        actions: address,
      };
  }
}
