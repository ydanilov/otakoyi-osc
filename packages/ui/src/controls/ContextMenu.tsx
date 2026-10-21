import * as React from "react";
import { Modal, Pressable, View } from "react-native";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import type { ContextMenuProps } from "./ContextMenu.types";

export type { ContextMenuProps, MenuAction } from "./ContextMenu.types";

/**
 * Long-press context menu where the system one is not available (web pult, Android for now):
 * the trigger's long-press opens a menu over a dimmed screen with the item's title and its
 * commands, destructive last in red. iOS uses the system menu (`ContextMenu.ios.tsx`).
 *
 * TODO(ds): replace with @osc/ui <ContextMenu> from feat/ds-components-storybook.
 */
export function ContextMenu({ actions, title, disabled, children }: ContextMenuProps) {
  const [open, setOpen] = React.useState(false);
  const trigger = React.cloneElement(children, {
    onLongPress: disabled ? undefined : () => setOpen(true),
  });
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <>
      {trigger}
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 p-6"
          onPress={() => setOpen(false)}
          accessibilityLabel="Close menu"
        >
          <View
            className="bg-popover border-border w-full max-w-xs overflow-hidden rounded-xl border"
            accessibilityRole="menu"
            testID="context-menu"
          >
            {title && (
              <Text
                className="text-muted-foreground border-border border-b px-4 py-2.5 text-xs"
                numberOfLines={2}
              >
                {title}
              </Text>
            )}
            {actions.map((a, i) => (
              <Pressable
                key={a.key}
                disabled={a.disabled}
                onPress={pick(a.onSelect)}
                accessibilityRole="menuitem"
                accessibilityState={{ disabled: !!a.disabled }}
                className={cn(
                  "active:bg-muted min-h-11 justify-center px-4",
                  i > 0 && "border-border border-t",
                  a.disabled && "opacity-40",
                )}
              >
                <Text
                  className={cn(
                    "text-[15px]",
                    a.destructive ? "text-status-critical" : "text-foreground",
                  )}
                >
                  {a.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
