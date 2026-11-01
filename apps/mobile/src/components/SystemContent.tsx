import type { PultStore } from "@osc/controls";
import { SYSTEM_PULT_ID } from "@osc/schema";
import { Button, CaretLeftIcon, Note, SystemScreen, type SystemValues } from "@osc/ui";
import * as React from "react";
import { View } from "react-native";
import { useApp, useSessionState } from "@/lib/app-context";

const KEYS = ["resw", "resh", "debug", "seed"] as const;

/** The System pult's values, re-rendered on every change (bridge state, feedback, other devices). */
function useSystemValues(store: PultStore | undefined): SystemValues {
  const subscribe = React.useCallback(
    (fn: () => void) => {
      if (!store) return () => {};
      const offs = KEYS.map((k) => store.subscribe(k, fn));
      return () => offs.forEach((off) => off());
    },
    [store],
  );
  const snapshot = React.useCallback(
    () => (store ? KEYS.map((k) => JSON.stringify(store.get(k))).join("|") : ""),
    [store],
  );
  const key = React.useSyncExternalStore(subscribe, snapshot);
  return React.useMemo(() => {
    if (!store || !key) return {};
    const num = (v: unknown) => (typeof v === "number" ? v : undefined);
    return {
      resw: num(store.get("resw")),
      resh: num(store.get("resh")),
      debug: typeof store.get("debug") === "boolean" ? (store.get("debug") as boolean) : undefined,
      seed: num(store.get("seed")),
    };
  }, [store, key]);
}

/**
 * Installation › System (ADR-018): the standard System screen, the same for every installation.
 * Values travel through the hidden `system` pult like any control, so the lease, the bridge state
 * and the installation's echo apply unchanged.
 */
export function SystemContent({ onBack }: { onBack?: () => void }) {
  const { session } = useApp();
  const s = useSessionState();
  const store = session?.stores.get(SYSTEM_PULT_ID);
  const values = useSystemValues(store);
  const canControl = session?.controlMode() === "control";
  return (
    <View className="gap-4" testID="system-content">
      {onBack && (
        <View className="flex-row">
          <Button
            label="Installation"
            icon={CaretLeftIcon}
            variant="ghost"
            size="sm"
            onPress={onBack}
          />
        </View>
      )}
      {!s.config?.system || !store ? (
        <Note>This installation has no System screen.</Note>
      ) : (
        <>
          <SystemScreen
            values={values}
            disabled={!canControl}
            onChange={(c) => {
              const control = store.control(c.key);
              if (control) store.interact(control, c.value);
            }}
          />
          {!canControl && (
            <Note>Take control to change the output size, debug overlay or seed.</Note>
          )}
        </>
      )}
    </View>
  );
}

export { useSystemValues };
