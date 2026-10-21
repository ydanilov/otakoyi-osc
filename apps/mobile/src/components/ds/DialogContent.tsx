// TODO(ds): replace with @osc/ui <DialogContent> from feat/ds-components-storybook.
import { Button } from "@osc/ui/components/ui/button";
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { View } from "react-native";

/**
 * Content of a dialog shown in a sheet (iPhone medium detent) or a form sheet (iPad): title,
 * message, anything else, then Cancel leading and one prominent action trailing (ADR-013).
 */
export function DialogContent({
  title,
  message,
  children,
  cancel,
  action,
}: {
  title: string;
  message?: string;
  children?: React.ReactNode;
  cancel?: { label: string; onPress: () => void };
  action?: { label: string; onPress: () => void; destructive?: boolean };
}) {
  return (
    <View className="gap-4 px-6 pb-6 pt-2">
      <View className="gap-1.5">
        <Text className="text-foreground text-xl font-semibold" accessibilityRole="header">
          {title}
        </Text>
        {message && <Text className="text-muted-foreground text-[15px] leading-5">{message}</Text>}
      </View>
      {children}
      {(cancel || action) && (
        <View className="flex-row gap-3 pt-2">
          {cancel && (
            <Button variant="secondary" className="flex-1" onPress={cancel.onPress}>
              <Text>{cancel.label}</Text>
            </Button>
          )}
          {action && (
            <Button
              variant={action.destructive ? "destructive" : "default"}
              className="flex-1"
              onPress={action.onPress}
            >
              <Text>{action.label}</Text>
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
