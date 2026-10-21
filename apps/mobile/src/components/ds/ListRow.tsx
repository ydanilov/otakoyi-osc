// TODO(ds): replace with @osc/ui <ListRow> from feat/ds-components-storybook.
import { Icon } from "@osc/ui/components/ui/icon";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

/** A group of rows on a raised card, with an optional caption above and footnote below. */
export function ListSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-1.5">
      {title && (
        <Text className="text-muted-foreground px-4 text-xs font-medium uppercase tracking-wider">
          {title}
        </Text>
      )}
      <View className="bg-card border-border overflow-hidden rounded-xl border">
        {rows.map((r, i) => (
          <View key={i} className={cn(i > 0 && "border-border border-t")}>
            {r}
          </View>
        ))}
      </View>
      {footer && <Text className="text-muted-foreground px-4 text-xs">{footer}</Text>}
    </View>
  );
}

/**
 * One row: icon, title, optional detail under it, value or accessory on the trailing side, and a
 * chevron when it pushes a view. Destructive rows are red and centred, like iOS.
 */
export function ListRow({
  title,
  detail,
  value,
  icon,
  accessory,
  onPress,
  chevron,
  destructive,
  disabled,
  testID,
}: {
  title: string;
  detail?: string;
  value?: string;
  icon?: LucideIcon;
  accessory?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const body = (
    <View
      className={cn("min-h-12 flex-row items-center gap-3 px-4 py-2.5", disabled && "opacity-40")}
    >
      {icon && (
        <View className="bg-muted h-7 w-7 items-center justify-center rounded-md">
          <Icon
            as={icon}
            size={16}
            className={destructive ? "text-status-critical" : "text-foreground"}
          />
        </View>
      )}
      <View className={cn("flex-1 gap-0.5", destructive && !icon && "items-center")}>
        <Text
          className={cn(
            "text-[15px]",
            destructive ? "text-status-critical font-medium" : "text-foreground",
          )}
          numberOfLines={1}
        >
          {title}
        </Text>
        {detail && (
          <Text className="text-muted-foreground text-xs" numberOfLines={2}>
            {detail}
          </Text>
        )}
      </View>
      {value !== undefined && (
        <Text className="text-muted-foreground font-mono text-sm" numberOfLines={1}>
          {value}
        </Text>
      )}
      {accessory}
      {chevron && <Icon as={ChevronRight} size={18} className="text-muted-foreground" />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      testID={testID}
      className="active:bg-muted"
    >
      {body}
    </Pressable>
  );
}
