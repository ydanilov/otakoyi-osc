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
