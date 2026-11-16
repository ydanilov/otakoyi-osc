import { PultProvider, SetupScreen, Button, CaretLeftIcon, Note } from "@osc/ui";
import * as React from "react";
import { View } from "react-native";
import { useApp, useSessionState } from "@/lib/app-context";

/**
 * Installation › Setup: the installation's one-off parameters (TouchDesigner `[setup]`), drawn from
 * the config's Setup pult (`placement: "installation"`). Its store on the bridge carries values, the
 * lease and the echo like any pult, so nothing here is special.
 */
export function SetupContent({ pultId, onBack }: { pultId: string; onBack?: () => void }) {
  const { session } = useApp();
  const s = useSessionState();
  const pult = s.config?.pults.find((p) => p.id === pultId);
  const store = session?.stores.get(pultId);
  const canControl = session?.controlMode() === "control";
  return (
    <View className="gap-4" testID="setup-content">
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
      {!pult || !store ? (
        <Note>This installation has no setup.</Note>
      ) : (
        <PultProvider store={store}>
          <SetupScreen pages={pult.pages} readOnly={!canControl} />
        </PultProvider>
      )}
    </View>
  );
}
