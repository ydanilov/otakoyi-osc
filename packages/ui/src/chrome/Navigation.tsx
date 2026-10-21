import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "../components/ui/text";
import { Surface, useDepthStyle } from "../ds/depth";
import { Glyph } from "../ds/Glyph";
import { CaretLeftIcon, type PhosphorIcon } from "../ds/icons";
import { cn } from "../lib/utils";
import { IconButton } from "./Button";

/** Figma `Screen Tab`: one tab. Active = raised on the bed; inactive = text on the bed. */
export function ScreenTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const shadow = useDepthStyle(active ? "raisedSm" : "flat");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={!!active}
      accessibilityLabel={label}
      className={cn(
        "min-h-9 flex-1 items-center justify-center rounded-md px-3",
        active ? "bg-secondary" : "bg-transparent",
      )}
      style={active ? shadow : undefined}
    >
      <Text
        className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Figma `Tab Bar`: an inset bed holding Screen Tabs (pult screens, activity ranges). */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <Surface
      depth="inset"
      radius="lg"
      className={cn("flex-row gap-1 p-1", className)}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => (
        <ScreenTab
          key={tab.id}
          label={tab.label}
          active={tab.id === value}
          onPress={() => onChange(tab.id)}
        />
      ))}
    </Surface>
  );
}

/** Figma `Top Bar`: back button + title for drawer sub-pages and settings screens. */
export function TopBar({
  title,
  onBack,
  trailing,
}: {
  title: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <View className="min-h-14 flex-row items-center gap-3 px-4">
      {onBack && <IconButton icon={CaretLeftIcon} label="Back" size={32} onPress={onBack} />}
      <Text
        className="text-foreground flex-1 text-lg font-semibold"
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {trailing}
    </View>
  );
}

/** Figma `Nav Item`: a row in a drawer menu. Active = inset bed + lit icon. */
export function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: PhosphorIcon;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const shadow = useDepthStyle(active ? "inset" : "flat");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-selected={!!active}
      accessibilityLabel={label}
      className={cn(
        "min-h-touch flex-row items-center gap-3 rounded-md px-3",
        active ? "bg-control-track" : "active:bg-muted",
      )}
      style={active ? shadow : undefined}
    >
      <Glyph icon={icon} tone={active ? "signal" : "muted"} size={18} />
      <Text
        className={cn("flex-1 text-sm", active ? "text-foreground" : "text-muted-foreground")}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
