export type SelectValue = string | number;

export interface SelectOption<T extends SelectValue = string> {
  label: string;
  value: T;
}

/** Shared by `Select.tsx` (web, Android: RN pull-down) and `Select.ios.tsx` (native SwiftUI menu). */
export interface SelectProps<T extends SelectValue = string> {
  /** Row label on the left ("Output"). */
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Render the menu open (Figma `State=Open`, stories). Web/Android only. */
  defaultOpen?: boolean;
}

export const selectedLabel = <T extends SelectValue>(
  options: ReadonlyArray<SelectOption<T>>,
  value: T,
) => options.find((o) => o.value === value)?.label ?? String(value);
