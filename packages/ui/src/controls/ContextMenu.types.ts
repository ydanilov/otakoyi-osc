import type * as React from "react";

/** One command of a long-press context menu (Apple HIG: destructive last, in red). */
export interface MenuAction {
  key: string;
  title: string;
  /** SF Symbol name on iOS (e.g. "trash"); ignored elsewhere. */
  icon?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect(): void;
}

export interface ContextMenuProps {
  /** Commands, in order. Put a destructive one last. */
  actions: MenuAction[];
  /** Title of the menu (the card's label), shown above the commands where the platform does. */
  title?: string;
  disabled?: boolean;
  /**
   * The trigger: a single element. The fallback menu adds `onLongPress` to it, so it should be a
   * Pressable (or accept `onLongPress`).
   */
  children: React.ReactElement<{ onLongPress?: () => void }>;
}
