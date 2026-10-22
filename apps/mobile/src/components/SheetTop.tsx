import { CaretLeftIcon, Glyph, XIcon, useTheme, type PhosphorIcon } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { Platform, Pressable, View } from "react-native";

/**
 * A sheet route's surface (Figma iOS 27 · System › Sheet - iPhone): the system sheet colour. On
 * iOS the system draws the sheet and its grabber around it; the web pult draws the grabber itself.
 */
export function SheetSurface({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.color.sheet }}>{children}</View>;
}

/**
 * Top of a sheet route (Figma Phone / 04 Settings, 05 Installation; iOS 27 sheet toolbar): 16 pt
 * below the sheet's top edge a 44 pt row — round Close × leading, the title centred; a pushed view
 * puts Back leading and Close trailing — then 10 pt to the content.
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
  const t = useTheme();
  return (
    <View className="px-4 pb-2.5 pt-4">
      {Platform.OS === "web" && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 6,
            alignSelf: "center",
            width: 60,
            height: 4,
            borderRadius: 2,
            backgroundColor: t.color.sheetGrabber,
          }}
        />
      )}
      <View className="h-11 flex-row items-center">
        <View className="w-11">
          {onBack ? (
            <ToolbarButton icon={CaretLeftIcon} label="Back" onPress={onBack} />
          ) : (
            <ToolbarButton icon={XIcon} label={`Close ${title}`} onPress={onClose} />
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
          {onBack && <ToolbarButton icon={XIcon} label={`Close ${title}`} onPress={onClose} />}
        </View>
      </View>
    </View>
  );
}

/** iOS sheet toolbar button (Figma Toolbar › Button Group): a 44 pt glass circle, white symbol. */
function ToolbarButton({
  icon,
  label,
  onPress,
}: {
  icon: PhosphorIcon;
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.color.sheetButton,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Glyph icon={icon} size={22} color={t.color.text} />
    </Pressable>
  );
}
