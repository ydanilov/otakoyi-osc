import { IconButton, CaretLeftIcon, XIcon } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { View } from "react-native";

/**
 * Top of a sheet route (Figma Phone / 04 Settings, 05 Installation; iOS 27 sheet): a round Close ×
 * leading and the title centred; a pushed view puts Back leading and Close trailing.
 */
export function SheetTop({
  title,
  onClose,
  onBack,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <View className="min-h-[60px] flex-row items-center px-4">
      <View className="w-11">
        {onBack ? (
          <IconButton icon={CaretLeftIcon} label="Back" onPress={onBack} />
        ) : (
          <IconButton icon={XIcon} label={`Close ${title}`} onPress={onClose} />
        )}
      </View>
      <Text
        className="text-foreground flex-1 text-center text-lg font-semibold"
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View className="w-11">
        {onBack && <IconButton icon={XIcon} label={`Close ${title}`} onPress={onClose} />}
      </View>
    </View>
  );
}
