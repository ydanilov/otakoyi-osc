import * as React from "react";
import { View } from "react-native";
import { Button } from "@osc/ui/components/ui/button";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import type { ControlMode } from "./store";

export type Connection = "online" | "connecting" | "offline";

const DOT: Record<Connection, string> = {
  online: "bg-status-online",
  connecting: "bg-status-warning",
  offline: "bg-status-offline",
};
const CONNECTION_LABEL: Record<Connection, string> = {
  online: "Online",
  connecting: "Connecting",
  offline: "Offline",
};

/**
 * Header above every pult: installation name, connection status and who holds control.
 * Status colours come from the status tokens, which a client brand cannot override.
 */
export function PultHeader({
  name,
  connection,
  mode,
  onRequestControl,
  logo,
  switcher,
}: {
  name: string;
  /** Pult dropdown (PultSelect); rendered next to the installation name. */
  switcher?: React.ReactNode;
  connection: Connection;
  mode: ControlMode;
  onRequestControl?: () => void;
  logo?: React.ReactNode;
}) {
  return (
    <View className="gap-2 border-b border-border px-4 pb-3 pt-2">
      <View className="flex-row items-center gap-3">
        {logo}
        {/* On phones the pult dropdown replaces the installation name to save width. */}
        <Text
          className={cn(
            "text-foreground shrink text-lg font-semibold",
            switcher ? "hidden sm:flex" : undefined,
          )}
          numberOfLines={1}
        >
          {name}
        </Text>
        {switcher}
        <View className="flex-1" />
        <View
          className="flex-row items-center gap-2"
          accessible
          accessibilityLabel={`Connection: ${CONNECTION_LABEL[connection]}`}
        >
          <View className={cn("h-2.5 w-2.5 rounded-full", DOT[connection])} />
          <Text className="text-muted-foreground text-xs">{CONNECTION_LABEL[connection]}</Text>
        </View>
      </View>
      {mode !== "control" && mode !== "offline" && (
        <View
          className={cn(
            "flex-row items-center justify-between gap-3 rounded-md px-3 py-2",
            mode === "studio-has-control" ? "bg-status-studio/15" : "bg-muted",
          )}
        >
          <Text className="text-foreground flex-1 text-sm">
            {mode === "studio-has-control"
              ? "The studio is controlling this installation"
              : "View only — another device is in control"}
          </Text>
          {mode === "view" && onRequestControl && (
            <Button size="sm" onPress={onRequestControl}>
              <Text>Take control</Text>
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
