import type { ControlValue, PromptAck } from "@osc/controls";
import * as React from "react";
import type { ControlMode, PultStore } from "./store";

const StoreContext = React.createContext<PultStore | null>(null);

export function PultProvider({ store, children }: { store: PultStore; children: React.ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function usePultStore(): PultStore {
  const s = React.useContext(StoreContext);
  if (!s) throw new Error("usePultStore must be used inside <PultProvider>");
  return s;
}

export function useControlValue(id: string): ControlValue {
  const store = usePultStore();
  return React.useSyncExternalStore(
    (fn) => store.subscribe(id, fn),
    () => store.get(id),
  );
}

const noMeta = { ack: null, rev: 0 } as const;

/**
 * Confirmation of a control's last prompt and the revision of its data on the bridge. Works
 * outside a pult too (the gallery): then there is nothing to confirm.
 */
export function useControlMeta(id: string): { ack: PromptAck | null; rev: number } {
  const store = React.useContext(StoreContext);
  const ack = React.useSyncExternalStore(
    (fn) => store?.subscribeMeta(id, fn) ?? (() => {}),
    () => store?.ack(id) ?? noMeta.ack,
  );
  const rev = React.useSyncExternalStore(
    (fn) => store?.subscribeMeta(id, fn) ?? (() => {}),
    () => store?.rev(id) ?? noMeta.rev,
  );
  return { ack, rev };
}

export function useControlMode(): ControlMode {
  const store = usePultStore();
  return React.useSyncExternalStore(
    (fn) => store.subscribeMode(fn),
    () => store.mode,
  );
}

/**
 * A relative control's accumulated change since the session started (Figma `+12`, `+0.02`). In a
 * pult it comes from the store (it survives page swipes while the pult is open); outside one
 * (Storybook, the gallery) the control keeps it itself through `add`.
 */
export function useRelativeOffset(id: string): { value: number; add: (d: number) => void } {
  const store = React.useContext(StoreContext);
  const [local, setLocal] = React.useState(0);
  const fromStore = React.useSyncExternalStore(
    (fn) => store?.subscribeMeta(id, fn) ?? (() => {}),
    () => store?.offset(id) ?? 0,
  );
  const add = React.useCallback(
    (d: number) => {
      if (!store) setLocal((v) => v + d);
    },
    [store],
  );
  return { value: store ? fromStore : local, add };
}
