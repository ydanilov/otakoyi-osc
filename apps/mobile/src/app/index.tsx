import type { PultStore } from "@osc/controls";
import type { InstallationConfig } from "@osc/schema";
import {
  PultHeader,
  PultPager,
  PultProvider,
  PultSelect,
  PultStore as Store,
  ThemeProvider,
  useControlMode,
  type Connection,
} from "@osc/ui";
import { Button } from "@osc/ui/components/ui/button";
import { Input } from "@osc/ui/components/ui/input";
import { Text } from "@osc/ui/components/ui/text";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import * as React from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { findBridge, useBridge } from "@/lib/bridge";
import { createDemoTransport, demoConfig } from "@/lib/demo";

const PIN_KEY = "otakoyi.pin";
const readPin = () => {
  try {
    return (
      new URLSearchParams(globalThis.location?.search ?? "").get("pin") ??
      globalThis.localStorage?.getItem(PIN_KEY) ??
      undefined
    );
  } catch {
    return undefined;
  }
};

/**
 * Pult screen.
 * - Served by a bridge (web pult on the installation's network): connects to it, renders the
 *   installation's config and shares state and the control lease with every other device.
 * - Otherwise: the demo installation over the demo transport (App Review, first launch).
 */
export default function PultScreen() {
  // Operators must not lose the screen mid-show. Native only: the web pult runs on any device.
  React.useEffect(() => {
    if (Platform.OS !== "web") activateKeepAwakeAsync("pult").catch(() => {});
  }, []);

  const [bridgeUrl, setBridgeUrl] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => {
    if (Platform.OS === "web") findBridge().then(setBridgeUrl);
    else setBridgeUrl(null);
  }, []);

  if (bridgeUrl === undefined)
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  if (bridgeUrl) return <BridgePult url={bridgeUrl} />;
  return <DemoPult />;
}

function BridgePult({ url }: { url: string }) {
  const [pin, setPin] = React.useState<string | undefined>(readPin);
  const session = useBridge(url, pin);

  if (session?.error?.code === "auth")
    return (
      <PinScreen
        wrong={!!pin}
        onSubmit={(p) => {
          try {
            globalThis.localStorage?.setItem(PIN_KEY, p);
          } catch {}
          setPin(p);
        }}
      />
    );
  if (!session?.config)
    return (
      <Centered>
        <ActivityIndicator />
        <Text className="text-muted-foreground text-sm">Connecting to the installation…</Text>
      </Centered>
    );

  const online = session.targets.every((t) => t.online);
  const connection: Connection =
    session.connection !== "open" ? "offline" : online ? "online" : "connecting";
  return (
    <PultView
      config={session.config}
      stores={session.stores}
      connection={connection}
      onRequestControl={session.take}
    />
  );
}

function DemoPult() {
  const storeRef = React.useRef<PultStore | null>(null);
  const transport = React.useMemo(() => createDemoTransport(() => storeRef.current), []);
  const stores = React.useMemo(
    () => new Map(demoConfig.pults.map((p) => [p.id, new Store(demoConfig, p, transport)])),
    [transport],
  );
  React.useEffect(() => transport.start(), [transport]);
  return (
    <PultView
      config={demoConfig}
      stores={stores}
      connection="online"
      onStore={(s) => (storeRef.current = s)}
      onRequestControl={() => storeRef.current?.setMode("control")}
    />
  );
}

/** One installation: pult dropdown, header with status and lease, and the pager. */
function PultView({
  config,
  stores,
  connection,
  onRequestControl,
  onStore,
}: {
  config: InstallationConfig;
  stores: Map<string, PultStore>;
  connection: Connection;
  onRequestControl: () => void;
  onStore?: (s: PultStore) => void;
}) {
  const [pultId, setPultId] = React.useState(config.pults[0]!.id);
  const pult = config.pults.find((p) => p.id === pultId) ?? config.pults[0]!;
  const store = stores.get(pult.id)!;
  React.useEffect(() => onStore?.(store), [store, onStore]);

  return (
    <ThemeProvider brand={config.theme}>
      <PultProvider store={store}>
        <SafeAreaView className="flex-1" edges={["top", "left", "right", "bottom"]}>
          <Header
            name={config.installation.name}
            connection={connection}
            onRequestControl={onRequestControl}
            switcher={<PultSelect pults={config.pults} value={pult.id} onChange={setPultId} />}
          />
          <PultPager key={pult.id} pages={pult.pages} />
        </SafeAreaView>
      </PultProvider>
    </ThemeProvider>
  );
}

function Header(props: {
  name: string;
  connection: Connection;
  switcher: React.ReactNode;
  onRequestControl: () => void;
}) {
  const mode = useControlMode();
  return <PultHeader {...props} mode={mode} />;
}

function PinScreen({ wrong, onSubmit }: { wrong: boolean; onSubmit: (pin: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <ThemeProvider brand={demoConfig.theme}>
      <Centered>
        <View className="w-full max-w-xs gap-3">
          <Text className="text-foreground text-lg font-semibold">Installation PIN</Text>
          <Input
            value={value}
            onChangeText={setValue}
            keyboardType="number-pad"
            secureTextEntry
            autoFocus
            onSubmitEditing={() => value && onSubmit(value)}
            accessibilityLabel="Installation PIN"
          />
          {wrong && <Text className="text-status-critical text-sm">Wrong PIN, try again.</Text>}
          <Button onPress={() => value && onSubmit(value)}>
            <Text>Connect</Text>
          </Button>
        </View>
      </Centered>
    </ThemeProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-background flex-1 items-center justify-center gap-3 p-6">{children}</View>
  );
}
