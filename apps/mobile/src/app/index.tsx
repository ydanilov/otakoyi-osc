import {
  PultHeader,
  PultPager,
  PultProvider,
  PultSelect,
  PultStore,
  ThemeProvider,
  useControlMode,
} from "@osc/ui";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import * as React from "react";
import { Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createDemoTransport, demoConfig } from "@/lib/demo";

/**
 * Pult screen. For now it runs the demo installation over the demo transport;
 * login, the bridge connection and the native OSC transport replace these in the next phases.
 */
export default function PultScreen() {
  // Operators must not lose the screen mid-show. Native only: the web pult runs on any device.
  React.useEffect(() => {
    if (Platform.OS !== "web") activateKeepAwakeAsync("pult").catch(() => {});
  }, []);

  const [pultId, setPultId] = React.useState(demoConfig.pults[0]!.id);
  const pult = demoConfig.pults.find((p) => p.id === pultId) ?? demoConfig.pults[0]!;

  const storeRef = React.useRef<PultStore | null>(null);
  const transport = React.useMemo(() => createDemoTransport(() => storeRef.current), []);
  // One store per pult; switching pults keeps each pult's state.
  const stores = React.useRef(new Map<string, PultStore>());
  const store = React.useMemo(() => {
    let s = stores.current.get(pult.id);
    if (!s) {
      s = new PultStore(demoConfig, pult, transport);
      stores.current.set(pult.id, s);
    }
    storeRef.current = s;
    return s;
  }, [pult, transport]);
  React.useEffect(() => transport.start(), [transport]);

  return (
    <ThemeProvider brand={demoConfig.theme}>
      <PultProvider store={store}>
        <SafeAreaView className="flex-1" edges={["top", "left", "right", "bottom"]}>
          <Header
            store={store}
            switcher={<PultSelect pults={demoConfig.pults} value={pult.id} onChange={setPultId} />}
          />
          <PultPager key={pult.id} pages={pult.pages} />
        </SafeAreaView>
      </PultProvider>
    </ThemeProvider>
  );
}

function Header({ store, switcher }: { store: PultStore; switcher: React.ReactNode }) {
  const mode = useControlMode();
  return (
    <PultHeader
      name={demoConfig.installation.name}
      switcher={switcher}
      connection="online"
      mode={mode}
      onRequestControl={() => store.setMode("control")}
    />
  );
}
