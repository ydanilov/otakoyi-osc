import { Badge, Button } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { View } from "react-native";

/** "DEMO · Simulated installation" with Exit demo, on the demo pult (ADR-012). */
export function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <View
      className="bg-muted mx-4 mb-1 flex-row items-center gap-3 rounded-md py-1 pl-3 pr-1"
      testID="demo-banner"
      accessibilityRole="summary"
    >
      <Badge label="Demo" />
      <Text className="text-foreground flex-1 text-xs" numberOfLines={1}>
        Simulated installation
      </Text>
      <Button label="Exit demo" variant="ghost" size="sm" onPress={onExit} />
    </View>
  );
}
