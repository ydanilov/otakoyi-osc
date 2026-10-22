import { Button, Chip } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { View } from "react-native";

/**
 * Demo banner (Figma Demo › Demo banner, ADR-012): a card row under the Pult Header — the DEMO chip
 * (signal LED), "Simulated installation" and a ghost "Exit demo".
 */
export function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <View
      className="bg-card min-h-12 flex-row items-center gap-2.5 py-1 pl-3 pr-1"
      style={{ borderRadius: 14, borderCurve: "continuous" }}
      testID="demo-banner"
      accessibilityRole="summary"
    >
      <Chip label="DEMO" tone="primary" />
      <Text className="text-muted-foreground flex-1 text-sm" numberOfLines={1}>
        Simulated installation
      </Text>
      <Button label="Exit demo" variant="ghost" onPress={onExit} />
    </View>
  );
}
