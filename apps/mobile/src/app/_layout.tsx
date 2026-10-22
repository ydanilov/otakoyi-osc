import "@osc/tokens/global.css";
import { PortalHost } from "@rn-primitives/portal";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { presentationFor } from "@osc/ui";
import { useWindowDimensions } from "react-native";
import { AppProvider } from "@/lib/app-context";
import { useBrand } from "@/lib/brand";
import { BASE_FONTS, loadFontWeights } from "@/lib/fonts";
import * as React from "react";

/**
 * Font families are registered under the names the tokens use (`font.family` in tokens.json),
 * so `font-sans` / `font-mono` resolve on every platform.
 *
 * Routes (ADR-012, ADR-013): Connect → loading (client-branded) → pult. Settings, Installation
 * (iPhone), "Enter address and PIN" and dialogs are system sheets; the scanner is full screen.
 */
export default function RootLayout() {
  const [loaded] = useFonts(BASE_FONTS);
  const [weights, setWeights] = React.useState(false);
  React.useEffect(() => {
    void loadFontWeights().finally(() => setWeights(true));
  }, []);
  if (!loaded || !weights) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <Routes />
          <PortalHost />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Routes() {
  const brand = useBrand();
  const { width } = useWindowDimensions();
  // DS presentation rules (ADR-013): detents and grabber per surface and form factor.
  const sheetFor = (surface: "settings" | "installation" | "dialog") => {
    const p = presentationFor(surface, width);
    // iPad Installation is the in-screen inspector; the route (deep link only) is a form sheet.
    const options =
      p.kind === "sheet"
        ? p.options
        : {
            presentation: "formSheet" as const,
            sheetAllowedDetents: [1],
            sheetGrabberVisible: false,
            sheetInitialDetentIndex: 0,
          };
    return { ...options, sheetCornerRadius: 28 };
  };
  const sheet = sheetFor("settings");
  return (
    <>
      <StatusBar style={brand.theme?.mode === "light" ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="connect" options={{ animation: "fade" }} />
        <Stack.Screen name="loading" options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="pult" options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="manual" options={{ ...sheet, sheetAllowedDetents: [0.62, 1] }} />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="settings" options={sheetFor("settings")} />
        <Stack.Screen name="installation" options={sheetFor("installation")} />
        <Stack.Screen name="dialog" options={sheetFor("dialog")} />
        <Stack.Screen name="gallery" />
      </Stack>
    </>
  );
}
