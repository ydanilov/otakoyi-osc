import { createTheme, themeToCssVars, type BrandInput, type Theme } from "@osc/tokens";
import { vars } from "nativewind";
import * as React from "react";
import { View, type ViewProps } from "react-native";

const ThemeContext = React.createContext<Theme>(createTheme());

/**
 * Applies the installation's brand on top of the base tokens.
 * - Skia controls read colours through `useTheme()`.
 * - NativeWind / Reusables components read the same values as CSS variables, overridden here with `vars()`.
 */
export function ThemeProvider({
  brand,
  children,
  style,
  className,
  ...props
}: ViewProps & { brand?: BrandInput | undefined }) {
  const theme = React.useMemo(() => createTheme(brand ?? {}), [brand]);
  const cssVars = React.useMemo(() => vars(themeToCssVars(theme)), [theme]);
  return (
    <ThemeContext.Provider value={theme}>
      <View
        {...props}
        className={[theme.mode, "flex-1 bg-background", className].filter(Boolean).join(" ")}
        style={[cssVars, style]}
      >
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return React.useContext(ThemeContext);
}
