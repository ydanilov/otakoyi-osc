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
  badge,
}: {
  /** Short state marker next to the value, e.g. FINE while fine-adjusting. */
  badge?: string | undefined;
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
          <View className="shrink-0 flex-row items-baseline gap-2">
            {badge && (
              <Text className="bg-brand-accent text-brand-accent-foreground rounded-sm px-1.5 font-mono text-xs">
                {badge}
              </Text>
            )}
            {value !== undefined && (
              <Text className="text-foreground font-mono text-sm" numberOfLines={1}>
                {value}
              </Text>
            )}
          </View>
        </View>
      )}
      <View className="flex-1">{children}</View>
    </View>
  );
}
