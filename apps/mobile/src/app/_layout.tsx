import "@osc/tokens/global.css";
import { Inter_400Regular } from "@expo-google-fonts/inter";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { PortalHost } from "@rn-primitives/portal";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

/**
 * Font families are registered under the names the tokens use (`font.family` in tokens.json),
 * so `font-sans` / `font-mono` resolve on every platform. A client font from the config
 * is registered the same way before its pult renders.
 */
export default function RootLayout() {
  const [loaded] = useFonts({ Inter: Inter_400Regular, "JetBrains Mono": JetBrainsMono_500Medium });
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
        <PortalHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
