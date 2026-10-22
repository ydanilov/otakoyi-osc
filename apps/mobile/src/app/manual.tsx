import { bridgeFromAddress, checkPin } from "@osc/protocol";
import { ConnectForm, ThemeProvider } from "@osc/ui";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useApp } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { closeSheet } from "@/lib/navigation";

/**
 * "Enter address and PIN" (ADR-012 fallback when the camera can't scan): the DS Connect Form in a
 * sheet over Connect (or over the loading screen after a wrong PIN, with the address filled in).
 * The installation's own rules apply on top of the form's: the address is checked by
 * `bridgeFromAddress` and the PIN is exactly 4 digits (`checkPin`).
 */
export default function Manual() {
  const app = useApp();
  const brand = useBrand();
  const params = useLocalSearchParams<{ address?: string }>();
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  const submit = async (p: { bridge: string; pin: string }) => {
    const a = bridgeFromAddress(p.bridge);
    if (!a.ok) return setError(a.message);
    const pin = checkPin(p.pin);
    if (!pin.ok) return setError(pin.message);
    setError(undefined);
    setBusy(true);
    await app.connect({ bridge: a.bridge, pin: p.pin });
    closeSheet();
    router.replace("/loading");
  };

  return (
    <ThemeProvider brand={params.address ? brand.theme : undefined}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" testID="manual-form">
          <ConnectForm
            initialAddress={params.address}
            onSubmit={(p) => void submit(p)}
            onCancel={closeSheet}
            busy={busy}
            error={error}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemeProvider>
  );
}
