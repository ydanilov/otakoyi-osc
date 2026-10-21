import * as React from "react";
import { View } from "react-native";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";

/** Label + value header around a control body. Keeps every control's chrome identical. */
export function ControlFrame({
  label,
  value,
  children,
  className,
  disabled,
}: {
  label?: string | undefined;
  value?: string | undefined;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean | undefined;
}) {
  return (
    <View className={cn("flex-1 gap-2", disabled && "opacity-40", className)}>
      {(label || value) && (
        <View className="min-h-5 flex-row items-baseline justify-between gap-2">
          {label ? (
            <Text
              className="text-muted-foreground shrink text-xs font-medium uppercase tracking-wider"
              numberOfLines={1}
            >
              {label}
            </Text>
          ) : (
            <View />
          )}
          {value !== undefined && (
            <Text className="text-foreground shrink-0 font-mono text-sm" numberOfLines={1}>
              {value}
            </Text>
          )}
        </View>
      )}
      <View className="flex-1">{children}</View>
    </View>
  );
}
