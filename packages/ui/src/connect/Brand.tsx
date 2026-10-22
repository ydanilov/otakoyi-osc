import * as React from "react";
import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Text } from "../components/ui/text";
import { cn } from "../lib/utils";
import { useTheme } from "../theme/ThemeProvider";

/**
 * Figma `Backdrop`: a full-screen client image (the installation itself) with a legibility gradient
 * into the background colour, behind the client-branded loading screen. Without an image it is the
 * plain background. Children are laid over it.
 */
export function Backdrop({
  source,
  children,
  label,
}: {
  source?: ImageSourcePropType;
  children?: React.ReactNode;
  /** Describe the image for VoiceOver; omit when it is decorative. */
  label?: string;
}) {
  const t = useTheme();
  return (
    <View className="bg-background flex-1 overflow-hidden">
      {source ? (
        <Image
          source={source}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessible={!!label}
          accessibilityLabel={label}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <LinearGradient id="legibility" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.color.background} stopOpacity={0.55} />
            <Stop offset="0.35" stopColor={t.color.background} stopOpacity={0.1} />
            <Stop offset="0.65" stopColor={t.color.background} stopOpacity={0.35} />
            <Stop offset="1" stopColor={t.color.background} stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#legibility)" />
      </Svg>
      <View style={StyleSheet.absoluteFill}>{children}</View>
    </View>
  );
}

const LOGO = {
  sm: { h: 32, title: "text-xl", sub: "text-[9px]" },
  lg: { h: 64, title: "text-display", sub: "text-xs" },
};

/**
 * Figma `Client Logo`: the installation's logo from the config (`theme.logo`), or — until the studio
 * ships one — its name set in the brand font with an optional subtitle ("AURORA · HALL · LIVE").
 * Part of the studio's branding; clients never change it.
 */
export function ClientLogo({
  name,
  subtitle,
  source,
  size = "lg",
}: {
  name: string;
  subtitle?: string;
  source?: ImageSourcePropType;
  size?: keyof typeof LOGO;
}) {
  const s = LOGO[size];
  if (source)
    return (
      <Image
        source={source}
        resizeMode="contain"
        style={{ height: s.h, width: s.h * 4 }}
        accessibilityRole="image"
        accessibilityLabel={name}
      />
    );
  return (
    <View
      className="items-center gap-1"
      accessible
      accessibilityRole="header"
      accessibilityLabel={subtitle ? `${name}, ${subtitle}` : name}
    >
      <Text
        className={cn("text-foreground font-bold uppercase", s.title)}
        style={{ letterSpacing: size === "lg" ? 8 : 4 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {name}
      </Text>
      {subtitle ? (
        <Text
          className={cn("text-muted-foreground font-semibold uppercase tracking-widest", s.sub)}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
