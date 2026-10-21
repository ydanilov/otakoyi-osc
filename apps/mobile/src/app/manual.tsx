import { bridgeFromAddress, checkPin, PIN_LENGTH } from "@osc/protocol";
import { ThemeProvider } from "@osc/ui";
import { Button } from "@osc/ui/components/ui/button";
import { Input } from "@osc/ui/components/ui/input";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SheetHeader } from "@/components/ds/Sheet";
import { useApp } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { closeSheet } from "@/lib/navigation";

/**
 * "Enter address and PIN" (ADR-012 fallback when the camera can't scan): the bridge address and
 * the 4-digit PIN printed under the pairing QR. A sheet over Connect (or over the loading screen
 * after a wrong PIN, with the address filled in).
 */
export default function Manual() {
  const app = useApp();
  const brand = useBrand();
  const params = useLocalSearchParams<{ address?: string }>();
  const [address, setAddress] = React.useState(params.address ?? "");
  const [pin, setPin] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const a = bridgeFromAddress(address);
  const p = checkPin(pin);
  const ok = a.ok && p.ok;

  const submit = async () => {
    setTried(true);
    if (!a.ok || !p.ok) return;
    await app.connect({ bridge: a.bridge, pin });
    closeSheet();
    router.replace("/loading");
  };

  return (
    <ThemeProvider brand={params.address ? brand.theme : undefined}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SheetHeader title="Enter address and PIN" onClose={closeSheet} />
        <View className="gap-5 px-5 pb-8 pt-3" testID="manual-form">
          <Text className="text-muted-foreground text-[15px] leading-5">
            Both are printed under the pairing QR on the installation's screen.
          </Text>
          <Field
            label="Address"
            error={tried && !a.ok ? a.message : undefined}
            input={
              <Input
                value={address}
                onChangeText={setAddress}
                placeholder="192.168.1.20:8080"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "url"}
                autoFocus={!params.address}
                returnKeyType="next"
                accessibilityLabel="Address"
                testID="manual-address"
              />
            }
          />
          <Field
            label="PIN"
            error={tried && !p.ok ? p.message : undefined}
            input={
              <Input
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\s/g, "").slice(0, PIN_LENGTH + 2))}
                placeholder="4 digits"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={PIN_LENGTH}
                autoFocus={!!params.address}
                onSubmitEditing={submit}
                accessibilityLabel="PIN"
                testID="manual-pin"
                className="font-mono tracking-[6px]"
              />
            }
          />
          <Button onPress={submit} disabled={tried && !ok} testID="manual-connect" className="mt-1">
            <Text>Connect</Text>
          </Button>
        </View>
      </KeyboardAvoidingView>
    </ThemeProvider>
  );
}

function Field({
  label,
  input,
  error,
}: {
  label: string;
  input: React.ReactNode;
  error?: string | undefined;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
        {label}
      </Text>
      <View className={cn(error && "rounded-md ring-1 ring-status-critical")}>{input}</View>
      {error && (
        <Text className="text-status-critical text-xs" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}
