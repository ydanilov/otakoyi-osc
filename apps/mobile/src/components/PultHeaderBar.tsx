import { Button } from "@osc/ui/components/ui/button";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { PanelRight, Settings } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { HeaderButton } from "./ds/HeaderButton";

export type Connection = "online" | "connecting" | "offline";

const DOT: Record<Connection, string> = {
  online: "bg-status-online",
  connecting: "bg-status-warning",
  offline: "bg-status-offline",
};
const LABEL: Record<Connection, string> = {
  online: "Online",
  connecting: "Connecting",
  offline: "Offline",
};

/**
 * Pult header (ADR-013): Settings leading, installation name with connection status, Installation
 * trailing. While this device is view-only, the "View only — Take control" banner sits under it.
 * Status colours come from the status tokens, which a brand never overrides.
 */
export function PultHeaderBar({
  name,
  pultName,
  connection,
  mode,
  inspectorOpen,
  onSettings,
  onInstallation,
  onTakeControl,
}: {
  name: string;
  pultName?: string | undefined;
  connection: Connection;
  mode: "control" | "view" | "studio-has-control" | "offline";
  inspectorOpen?: boolean;
  onSettings: () => void;
  onInstallation: () => void;
  onTakeControl: () => void;
}) {
  return (
    <View className="gap-2 px-3 pb-2 pt-1">
      <View className="flex-row items-center gap-3">
        <HeaderButton
          icon={Settings}
          label="Settings"
          onPress={onSettings}
          testID="header-settings"
        />
        <View
          className="flex-1 items-center"
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${name}${pultName ? `, ${pultName}` : ""}, ${LABEL[connection]}`}
        >
          <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
            {name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <View className={cn("h-2 w-2 rounded-full", DOT[connection])} />
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {pultName ? `${pultName} · ` : ""}
              {LABEL[connection]}
            </Text>
          </View>
        </View>
        <HeaderButton
          icon={PanelRight}
          label="Installation"
          onPress={onInstallation}
          active={inspectorOpen}
          testID="header-installation"
        />
      </View>
      {(mode === "view" || mode === "studio-has-control") && (
        <View
          className={cn(
            "flex-row items-center justify-between gap-3 rounded-lg px-3 py-2",
            mode === "studio-has-control" ? "bg-status-studio/15" : "bg-muted",
          )}
        >
          <Text className="text-foreground flex-1 text-sm">
            {mode === "studio-has-control"
              ? "The studio is controlling this installation"
              : "View only — another device is in control"}
          </Text>
          {mode === "view" && (
            <Button size="sm" onPress={onTakeControl}>
              <Text>Take control</Text>
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

/** "DEMO · Simulated installation" with Exit demo (ADR-012). */
export function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <View
      className="bg-brand-accent/15 border-brand-accent/40 mx-3 mb-1 flex-row items-center gap-3 rounded-lg border px-3 py-1.5"
      testID="demo-banner"
    >
      <Text className="text-foreground flex-1 text-xs" numberOfLines={1}>
        <Text className="text-brand-accent text-xs font-semibold tracking-wider">DEMO</Text>
        {"  ·  "}Simulated installation
      </Text>
      <Button size="sm" variant="ghost" onPress={onExit} accessibilityLabel="Exit demo">
        <Text className="text-brand-accent">Exit demo</Text>
      </Button>
    </View>
  );
}
