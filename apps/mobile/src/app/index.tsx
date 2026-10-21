import {
  PultHeader,
  PultPage,
  PultProvider,
  PultStore,
  ThemeProvider,
  useControlMode,
} from "@osc/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@osc/ui/components/ui/tabs";
import { Text } from "@osc/ui/components/ui/text";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import * as React from "react";
import { Platform, View } from "react-native";
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
  const storeRef = React.useRef<PultStore | null>(null);
  const transport = React.useMemo(() => createDemoTransport(() => storeRef.current), []);
  const pult = demoConfig.pults[0]!;
  const store = React.useMemo(() => {
    const s = new PultStore(demoConfig, pult, transport);
    storeRef.current = s;
    return s;
  }, [pult, transport]);
  React.useEffect(() => transport.start(), [transport]);

  return (
    <ThemeProvider brand={demoConfig.theme}>
      <PultProvider store={store}>
        <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
          <Header name={`${demoConfig.installation.name} · ${pult.name}`} store={store} />
          <PultTabs />
        </SafeAreaView>
      </PultProvider>
    </ThemeProvider>
  );
}

function Header({ name, store }: { name: string; store: PultStore }) {
  const mode = useControlMode();
  return (
    <PultHeader
      name={name}
      connection="online"
      mode={mode}
      onRequestControl={() => store.setMode("control")}
    />
  );
}

function PultTabs() {
  const pages = demoConfig.pults[0]!.pages;
  const [tab, setTab] = React.useState(pages[0]!.id);
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex-1">
      <View className="px-4 pt-3">
        <TabsList className="w-full">
          {pages.map((p) => (
            <TabsTrigger key={p.id} value={p.id} className="flex-1">
              <Text>{p.title}</Text>
            </TabsTrigger>
          ))}
        </TabsList>
      </View>
      {pages.map((p) => (
        <TabsContent key={p.id} value={p.id} className="flex-1">
          <PultPage page={p} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
