import * as React from "react";
import { View, type ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark, Wordmark } from "../chrome/Brand";
import { Button } from "../chrome/Button";
import { Loader } from "../chrome/Loader";
import { InfoCard, Note } from "../chrome/Status";
import { Text } from "../components/ui/text";
import { KeyIcon, MonitorIcon, ScanIcon, WifiSlashIcon } from "../ds/icons";
import { manualPairing } from "../ds/logic";
import { TextField } from "../forms/Field";
import { Backdrop, ClientLogo } from "./Brand";

/**
 * Pattern `Connect` (ADR-012, no client login): the first screen. Three ways in — scan the pairing
 * QR shown on the installation, enter its address and PIN (form in a sheet), or try the demo.
 */
export function ConnectOptions({
  onScan,
  onEnterAddress,
  onDemo,
}: {
  onScan: () => void;
  onEnterAddress: () => void;
  onDemo: () => void;
}) {
  return (
    <View className="flex-1 justify-between gap-8 px-6 py-10">
      <View className="items-center gap-4 pt-10">
        <BrandMark size="md" />
        <Wordmark size="lg" />
      </View>
      <View className="gap-3">
        <Button label="Scan pairing QR" icon={ScanIcon} size="lg" onPress={onScan} block />
        <Button
          label="Enter address and PIN"
          icon={KeyIcon}
          variant="secondary"
          size="lg"
          onPress={onEnterAddress}
          block
        />
        <Button label="Try the demo" icon={MonitorIcon} variant="ghost" onPress={onDemo} block />
        <Note>
          The QR is on the installation's screen when pairing mode is on. Ask on site or the studio.
        </Note>
      </View>
    </View>
  );
}

/**
 * Content of the "Enter address and PIN" sheet. Validates with `manualPairing()` (unit-tested) and
 * returns the same pairing the QR deep link carries; connecting is the screen's job.
 */
export function ConnectForm({
  onSubmit,
  onCancel,
  busy,
  error,
  initialAddress = "",
}: {
  onSubmit: (pairing: { bridge: string; pin: string }) => void;
  onCancel?: () => void;
  busy?: boolean;
  /** Connection error from the screen (e.g. wrong PIN), shown under the PIN. */
  error?: string;
  initialAddress?: string;
}) {
  const [address, setAddress] = React.useState(initialAddress);
  const [pin, setPin] = React.useState("");
  const [fieldError, setFieldError] = React.useState<{
    field: "address" | "pin";
    message: string;
  } | null>(null);
  const submit = () => {
    const r = manualPairing(address, pin);
    if (!r.ok) return setFieldError({ field: r.field, message: r.message });
    setFieldError(null);
    onSubmit(r.pairing);
  };
  return (
    <View className="gap-4 px-5 pb-5 pt-6">
      <Text className="text-foreground text-xl font-semibold" accessibilityRole="header">
        Enter address and PIN
      </Text>
      <Text className="text-muted-foreground text-sm">
        Both are printed under the pairing QR on the installation screen.
      </Text>
      <TextField
        label="Address"
        icon={MonitorIcon}
        value={address}
        onChangeText={setAddress}
        placeholder="192.168.1.20"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={fieldError?.field === "address" ? fieldError.message : undefined}
      />
      <TextField
        label="PIN"
        icon={KeyIcon}
        value={pin}
        onChangeText={setPin}
        placeholder="4–8 digits"
        keyboardType="number-pad"
        secureTextEntry
        textContentType="oneTimeCode"
        onSubmitEditing={submit}
        error={fieldError?.field === "pin" ? fieldError.message : error}
      />
      <View className="flex-row gap-3 pt-2">
        {onCancel && (
          <Button label="Cancel" variant="secondary" onPress={onCancel} className="flex-1" />
        )}
        <Button
          label={busy ? "Connecting…" : "Connect"}
          onPress={submit}
          disabled={busy}
          className="flex-1"
        />
      </View>
    </View>
  );
}

/**
 * Pattern `Client loading`: the client-branded screen shown after launch while the app connects
 * (ADR-013 launch). Backdrop + Client Logo + Loader; a connection problem is shown inline with
 * Retry, never as an alert at startup.
 */
export function BrandedLoading({
  name,
  subtitle,
  logo,
  backdrop,
  status = "connecting",
  message,
  onRetry,
  onForget,
}: {
  name: string;
  subtitle?: string;
  logo?: ImageSourcePropType;
  backdrop?: ImageSourcePropType;
  status?: "connecting" | "error";
  /** Error explanation, e.g. "Can't reach Aurora Hall. Check that you are on its Wi-Fi." */
  message?: string;
  onRetry?: () => void;
  /** "Forget this installation" → back to Connect. */
  onForget?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Backdrop source={backdrop}>
      <View
        className="flex-1 items-center justify-between px-6"
        style={{ paddingTop: insets.top + 96, paddingBottom: insets.bottom + 40 }}
      >
        <ClientLogo name={name} subtitle={subtitle} source={logo} />
        {status === "connecting" ? (
          <Loader label={`Connecting to ${name}…`} />
        ) : (
          <View className="gap-3 self-stretch">
            <InfoCard icon={WifiSlashIcon}>{message ?? `Can't reach ${name}.`}</InfoCard>
            <View className="flex-row gap-3">
              {onForget && (
                <Button label="Forget" variant="ghost" onPress={onForget} className="flex-1" />
              )}
              {onRetry && <Button label="Retry" onPress={onRetry} className="flex-1" />}
            </View>
          </View>
        )}
      </View>
    </Backdrop>
  );
}
