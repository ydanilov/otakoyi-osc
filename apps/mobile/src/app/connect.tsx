import { parsePairing } from "@osc/protocol";
import { ThemeProvider } from "@osc/ui";
import { Icon } from "@osc/ui/components/ui/icon";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { router, useLocalSearchParams } from "expo-router";
import { Keyboard, ScanLine, Sparkles, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/lib/app-context";

/**
 * First run (ADR-012, no client login): Connect. Scan the pairing QR, enter the address and PIN,
 * or try the demo. Also the deep link target — `otakoyi-control://connect?bridge=…&pin=…&name=…`
 * (the pairing QR, opened by the phone's camera) goes straight to the loading screen.
 */
export default function Connect() {
  const app = useApp();
  const params = useLocalSearchParams();
  const hasLink = typeof params.bridge === "string";
  const pairing = React.useMemo(
    () => (hasLink ? parsePairing(params as Record<string, unknown>) : null),
    [hasLink, params],
  );
  const [starting, setStarting] = React.useState(false);

  React.useEffect(() => {
    if (!pairing) return;
    void app.connect(pairing).then(() => router.replace("/loading"));
  }, [pairing]); // eslint-disable-line react-hooks/exhaustive-deps

  const demo = async () => {
    setStarting(true);
    await app.startDemo();
    router.replace("/loading");
  };

  return (
    <ThemeProvider>
      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-full max-w-sm gap-8">
            <View className="gap-3">
              <Text className="text-brand-accent text-xs font-semibold uppercase tracking-[3px]">
                Otakoyi Control
              </Text>
              <Text
                className="text-foreground text-[28px] font-semibold leading-9"
                accessibilityRole="header"
              >
                Connect to an installation
              </Text>
              <Text className="text-muted-foreground text-[15px] leading-5">
                Scan the pairing QR on the installation's screen. No account needed.
              </Text>
            </View>

            {hasLink && !pairing && (
              <View
                className="bg-status-critical/10 border-status-critical/40 gap-1 rounded-xl border p-4"
                testID="bad-link"
              >
                <Text className="text-foreground font-semibold">This link is not valid</Text>
                <Text className="text-muted-foreground text-sm">
                  Scan the QR code on the installation screen again, or ask the studio for a new
                  one.
                </Text>
              </View>
            )}

            <View className="gap-3">
              <Option
                icon={ScanLine}
                title="Scan pairing QR"
                detail="Shown on the installation for 2 minutes"
                primary
                onPress={() => router.push("/scan")}
                testID="connect-scan"
              />
              <Option
                icon={Keyboard}
                title="Enter address and PIN"
                detail="Printed under the QR code"
                onPress={() => router.push("/manual")}
                testID="connect-manual"
              />
              <Option
                icon={Sparkles}
                title="Try the demo"
                detail="A simulated installation, no hardware needed"
                onPress={demo}
                disabled={starting}
                testID="connect-demo"
              />
            </View>

            <Text className="text-muted-foreground text-center text-xs leading-4">
              To show the pairing QR, press Ctrl+Shift+P on the installation computer.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </ThemeProvider>
  );
}

function Option({
  icon,
  title,
  detail,
  primary,
  disabled,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      testID={testID}
      className={cn(
        "min-h-16 flex-row items-center gap-4 rounded-2xl border px-4 py-3",
        primary
          ? "bg-primary border-primary active:opacity-90"
          : "bg-secondary border-border active:bg-muted",
        disabled && "opacity-50",
      )}
    >
      <View
        className={cn(
          "h-10 w-10 items-center justify-center rounded-full",
          primary ? "bg-primary-foreground/15" : "bg-muted",
        )}
      >
        <Icon
          as={icon}
          size={20}
          className={primary ? "text-primary-foreground" : "text-foreground"}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text
          className={cn(
            "text-[16px] font-semibold",
            primary ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {title}
        </Text>
        <Text
          className={cn(
            "text-xs",
            primary ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}
