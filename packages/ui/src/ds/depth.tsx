import { boxShadow, type Depth, type GlowTone } from "@osc/tokens";
import * as React from "react";
import { View, type GestureResponderEvent, type ViewProps } from "react-native";
import { cn } from "../lib/utils";
import { useTheme } from "../theme/ThemeProvider";

export type { Depth, GlowTone };

const RADIUS = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};
export type Radius = keyof typeof RADIUS;

/** Default fill per depth: raised cards sit on `card`, beds are the recessed control track. */
const FILL: Record<Depth, string> = {
  raised: "bg-card",
  raisedSm: "bg-card",
  inset: "bg-control-track",
  pressed: "bg-control-track",
  flat: "bg-muted",
};

/** Box-shadow style for a depth, from the theme's elevation tokens. */
export function useDepthStyle(depth: Depth, glow?: GlowTone | false) {
  const t = useTheme();
  return React.useMemo(() => ({ boxShadow: boxShadow(t, depth, glow) }), [t, depth, glow]);
}

/**
 * The neumorphic building block. Every DS surface is a `Surface` with a depth:
 * raised (interactive, top-level), inset (beds, active), flat (info inside a card), pressed.
 * Glow is opt-in and reserved for lit values and pressed buttons.
 */
export function Surface({
  depth = "raised",
  glow,
  radius = "lg",
  fill = true,
  className,
  style,
  ...props
}: ViewProps & {
  depth?: Depth;
  glow?: GlowTone | false;
  radius?: Radius;
  /** Paint the default fill for the depth. Pass false to supply your own `bg-*` class. */
  fill?: boolean;
  className?: string;
}) {
  const shadow = useDepthStyle(depth, glow);
  return (
    <View
      className={cn(fill && FILL[depth], RADIUS[radius], className)}
      style={[shadow, style]}
      {...props}
    />
  );
}

/**
 * Pressed state for a pressable surface. `forced` lets stories and Figma "State=Pressed" variants
 * render the pressed look without a finger on the screen.
 */
export function usePressState(
  forced: boolean | undefined,
  handlers: {
    onPressIn?: ((e: GestureResponderEvent) => void) | null | undefined;
    onPressOut?: ((e: GestureResponderEvent) => void) | null | undefined;
  } = {},
) {
  const [down, setDown] = React.useState(false);
  return {
    pressed: forced ?? down,
    onPressIn: (e: GestureResponderEvent) => {
      setDown(true);
      handlers.onPressIn?.(e);
    },
    onPressOut: (e: GestureResponderEvent) => {
      setDown(false);
      handlers.onPressOut?.(e);
    },
  };
}
