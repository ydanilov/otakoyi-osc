import * as React from "react";
import { Modal, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Scrim } from "../chrome/Scrim";
import { Text } from "../components/ui/text";
import { Surface } from "../ds/depth";
import { Glyph } from "../ds/Glyph";
import type { PhosphorIcon } from "../ds/icons";
import { dialogPresentation, type DialogPresentation } from "../ds/logic";
import { cn } from "../lib/utils";
import { ThemeLayer } from "../theme/ThemeProvider";

/**
 * Figma `Dialog` (Container=Sheet | Modal). One component, two presentations chosen by window
 * width (`dialogPresentation`): a bottom sheet on phones, a centred modal on tablets (ADR-013).
 * The blurred Scrim dims the pult behind; tapping it dismisses unless `dismissable` is false.
 * Slots: `icon`, body `children`, `actions` (buttons, primary last).
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  actions,
  dismissable = true,
  presentation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: PhosphorIcon;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  dismissable?: boolean;
  /** Override the width-based choice (stories, Figma `Container=` variants). */
  presentation?: DialogPresentation;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mode = presentation ?? dialogPresentation(width);
  const sheet = mode === "sheet";
  const close = dismissable ? () => onOpenChange(false) : undefined;
  return (
    <Modal
      visible={open}
      transparent
      animationType={sheet ? "slide" : "fade"}
      onRequestClose={() => close?.()}
      supportedOrientations={["portrait", "landscape"]}
      statusBarTranslucent
    >
      <ThemeLayer>
        <Scrim onPress={close} />
        <View
          className={cn("flex-1", sheet ? "justify-end" : "items-center justify-center p-6")}
          pointerEvents="box-none"
        >
          <Surface
            depth="raised"
            radius="xl"
            className={cn("gap-4 p-5", sheet ? "rounded-b-none" : "w-full max-w-md")}
            style={[
              { maxHeight: height * (sheet ? 0.9 : 0.8) },
              sheet && { paddingBottom: Math.max(insets.bottom, 12) + 8 },
            ]}
            accessibilityViewIsModal
            accessibilityRole="alert"
            aria-modal
          >
            {sheet && <View className="bg-border h-1 w-10 self-center rounded-full" />}
            <ScrollView contentContainerClassName="items-center gap-3" bounces={false}>
              {icon && (
                <Surface
                  depth="raisedSm"
                  radius="lg"
                  className="h-16 w-16 items-center justify-center"
                >
                  <Glyph icon={icon} tone="signal" size={32} />
                </Surface>
              )}
              <Text
                className="text-foreground text-center text-xl font-semibold"
                accessibilityRole="header"
              >
                {title}
              </Text>
              {description ? (
                <Text className="text-muted-foreground text-center text-sm">{description}</Text>
              ) : null}
              {children}
            </ScrollView>
            {actions ? <View className="flex-row gap-3">{actions}</View> : null}
          </Surface>
        </View>
      </ThemeLayer>
    </Modal>
  );
}
