import { Button, ContextMenu as Menu, Host, RNHostView } from "@expo/ui/swift-ui";
import type { SFSymbol } from "sf-symbols-typescript";
import * as React from "react";
import type { ContextMenuProps } from "./ContextMenu.types";

export type { ContextMenuProps, MenuAction } from "./ContextMenu.types";

/**
 * iOS: the system context menu (SwiftUI `contextMenu` through `@expo/ui`), with the long-press
 * lift preview drawn by the system. The trigger is the React Native card, hosted inside SwiftUI.
 *
 * TODO(ds): replace with @osc/ui <ContextMenu> from feat/ds-components-storybook.
 */
export function ContextMenu({ actions, disabled, children }: ContextMenuProps) {
  if (disabled) return children;
  return (
    <Host matchContents>
      <Menu>
        <Menu.Items>
          {actions.map((a) => (
            <Button
              key={a.key}
              label={a.title}
              {...(a.icon ? { systemImage: a.icon as SFSymbol } : {})}
              {...(a.destructive ? { role: "destructive" as const } : {})}
              onPress={a.disabled ? undefined : a.onSelect}
            />
          ))}
        </Menu.Items>
        <Menu.Trigger>
          <RNHostView matchContents>{children}</RNHostView>
        </Menu.Trigger>
      </Menu>
    </Host>
  );
}
