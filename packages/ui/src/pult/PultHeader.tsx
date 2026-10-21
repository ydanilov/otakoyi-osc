import * as React from "react";
import { View } from "react-native";
import { ConnectionStatus, StatusBanner, type Connection } from "../chrome/Status";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import type { ControlMode } from "./store";

export type { Connection };

/**
 * Header above every pult (Figma `Pult Header`, Mode=Control | View | Studio): installation name
 * or pult switcher, connection status and — when this device is not in control — the view-only or
 * studio banner. Status colours come from the status tokens, which a client brand cannot override.
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
    <View className="gap-2 px-4 pb-3 pt-2">
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
        <ConnectionStatus state={connection} />
      </View>
      {mode === "view" && <StatusBanner mode="view" onTakeControl={onRequestControl} />}
      {mode === "studio-has-control" && <StatusBanner mode="studio" />}
    </View>
  );
}
