// TODO(ds): replace with @osc/ui <HeaderButton> from feat/ds-components-storybook.
import { Icon } from "@osc/ui/components/ui/icon";
import { cn } from "@osc/ui/lib/utils";
import type { LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable } from "react-native";

/**
 * Round icon button of the pult header (Settings leading, Installation trailing). Raised,
 * 44 pt touch target.
 */
export function HeaderButton({
  icon,
  label,
  onPress,
  active,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      testID={testID}
      hitSlop={6}
      className={cn(
        "border-border h-11 w-11 items-center justify-center rounded-full border",
        active ? "bg-primary" : "bg-secondary active:bg-muted",
      )}
    >
      <Icon
        as={icon}
        size={20}
        className={active ? "text-primary-foreground" : "text-foreground"}
      />
    </Pressable>
  );
}
