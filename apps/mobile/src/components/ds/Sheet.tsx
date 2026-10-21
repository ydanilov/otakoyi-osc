// TODO(ds): replace with @osc/ui sheet / inspector components from feat/ds-components-storybook.
import { Icon } from "@osc/ui/components/ui/icon";
import { Text } from "@osc/ui/components/ui/text";
import { ChevronLeft, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

/**
 * Top bar of a sheet or the iPad inspector (HIG): Close × (or Back ‹) leading, title, optional
 * trailing action. The system draws the grabber and material on iOS.
 */
export function SheetHeader({
  title,
  onClose,
  onBack,
  trailing,
}: {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <View className="min-h-14 flex-row items-center gap-2 px-3 pt-2">
      <View className="w-24 flex-row">
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="min-h-touch flex-row items-center pr-2"
            hitSlop={6}
          >
            <Icon as={ChevronLeft} size={22} className="text-brand-accent" />
            <Text className="text-brand-accent text-[15px]">Back</Text>
          </Pressable>
        ) : onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="sheet-close"
            className="bg-muted h-8 w-8 items-center justify-center rounded-full"
            hitSlop={8}
          >
            <Icon as={X} size={16} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
      <Text
        className="text-foreground flex-1 text-center text-[17px] font-semibold"
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View className="w-24 flex-row justify-end">{trailing}</View>
    </View>
  );
}
