import type { Pairing } from "@osc/protocol";
import type { Simulator } from "@osc/sim";
import * as React from "react";
import { AppState } from "react-native";
import { createBridgeSession, deviceId } from "./bridge";
import { createDemoSession } from "./demo";
import { createPairingStore, type SavedPairing } from "./pairing";
import { deliveryFor, notificationText, statusEvents, type AppPhase } from "./notifications";
import { notifier } from "./platform/notifier";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "./prefs";
import { prefsStorage, secureStorage } from "./platform/storage";
import type { Session, SessionState } from "./session";

const pairings = createPairingStore(secureStorage);

interface AppContextValue {
  session: Session | null;
  /** The simulator behind a demo session (for the preview), else null. */
  sim: Simulator | null;
  /** When the current connection attempt started (the loading screen's minimum time). */
  startedAt: number;
  /** The brand to show before the config arrives (saved with the pairing). */
  savedBrand: SavedPairing["brand"];
  prefs: Prefs;
  setPrefs(p: Partial<Prefs>): void;
  /** The pult on screen (switched from the Installation panel); null = the config's first. */
  pultId: string | null;
  setPultId(id: string): void;
  /** Connect to a bridge (QR, deep link, address + PIN, or the saved pairing). */
  connect(p: Pairing, brand?: SavedPairing["brand"]): Promise<void>;
  /** "Try the demo". */
  startDemo(): Promise<void>;
  /** Retry from the loading screen. */
  retry(): void;
  /** Settings → "Forget this installation" / "Exit demo": back to Connect. */
  leave(): Promise<void>;
  loadSaved(): Promise<SavedPairing | null>;
}

const Ctx = React.createContext<AppContextValue | null>(null);

/**
 * The app's one connection (ADR-012: no accounts — a device is paired with one installation, or
 * runs the demo). Lives above the router so sheets (Settings, Installation, dialogs) share it.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [sim, setSim] = React.useState<Simulator | null>(null);
  const [startedAt, setStartedAt] = React.useState(0);
  const [savedBrand, setSavedBrand] = React.useState<SavedPairing["brand"]>(undefined);
  const [prefs, setPrefsState] = React.useState<Prefs>(DEFAULT_PREFS);
  const [pultId, setPultId] = React.useState<string | null>(null);
  const current = React.useRef<{ session: Session | null; sim: Simulator | null }>({
    session: null,
    sim: null,
  });

  React.useEffect(() => {
    void loadPrefs(prefsStorage).then(setPrefsState);
  }, []);

  const replace = React.useCallback((next: Session | null, nextSim: Simulator | null) => {
    current.current.session?.stop();
    current.current.sim?.stop();
    current.current = { session: next, sim: nextSim };
    setSession(next);
    setSim(nextSim);
    setPultId(null);
    setStartedAt(Date.now());
    next?.start();
  }, []);

  // A real bridge that answered: remember the pairing with its brand for the next launch.
  React.useEffect(() => {
    if (!session || session.kind !== "bridge") return;
    let saved = 0;
    return session.subscribe(() => {
      const s = session.state;
      if (!s.config || s.welcomedAt === saved) return;
      saved = s.welcomedAt ?? 0;
      void pairings.save({
        bridge: session.bridge!,
        pin: session.pin,
        name: s.config.installation.name,
        brand: { name: s.config.installation.name, theme: s.config.theme },
      });
    });
  }, [session]);

  // Status notifications: session changes worth telling a user whose app is in the background.
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  React.useEffect(() => {
    if (!session) return;
    let prev = session.state;
    return session.subscribe(() => {
      const next = session.state;
      const events = statusEvents(prev, next, session.device);
      prev = next;
      if (!events.length || !prefsRef.current.notifications || !notifier.supported) return;
      const phase = (AppState.currentState ?? "active") as AppPhase;
      if (phase === "active") return; // the header banners and dialogs show it
      void notifier
        .permission()
        .then((permission) => {
          if (deliveryFor({ enabled: true, supported: true, permission, phase }) !== "notify")
            return;
          for (const e of events) {
            const { title, body } = notificationText(e, session.displayName);
            void notifier.show(title, body).catch(() => {});
          }
        })
        .catch(() => {});
    });
  }, [session]);

  // Unmount: close the connection.
  React.useEffect(() => () => replace(null, null), [replace]);

  const value = React.useMemo<AppContextValue>(
    () => ({
      session,
      sim,
      startedAt,
      savedBrand,
      prefs,
      pultId,
      setPultId,
      setPrefs: (p) =>
        setPrefsState((cur) => {
          const next = { ...cur, ...p };
          void savePrefs(prefsStorage, next);
          return next;
        }),
      async connect(p, brand) {
        const device = await deviceId(prefsStorage);
        setSavedBrand(brand);
        replace(createBridgeSession(p, device), null);
      },
      async startDemo() {
        const device = await deviceId(prefsStorage);
        const { session: s, sim: simulator } = await createDemoSession(device);
        setSavedBrand(undefined);
        replace(s, simulator);
      },
      retry() {
        setStartedAt(Date.now());
        current.current.session?.restart();
      },
      async leave() {
        const wasBridge = current.current.session?.kind === "bridge";
        replace(null, null);
        setSavedBrand(undefined);
        if (wasBridge) await pairings.clear();
      },
      loadSaved: () => pairings.load(),
    }),
    [session, sim, startedAt, savedBrand, prefs, pultId, replace],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

const EMPTY: SessionState = {
  connection: "closed",
  config: null,
  lease: null,
  targets: [],
  modes: { blackout: false, idle: false, pause: false },
  actions: [],
  activity: [],
  error: null,
  lost: false,
  welcomedAt: null,
  protocol: null,
  actionError: null,
};

/** The current session's state (re-renders on every change). */
export function useSessionState(): SessionState {
  const { session } = useApp();
  return React.useSyncExternalStore(
    session?.subscribe ?? noopSubscribe,
    session?.getSnapshot ?? emptySnapshot,
    session?.getSnapshot ?? emptySnapshot,
  );
}

const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;
