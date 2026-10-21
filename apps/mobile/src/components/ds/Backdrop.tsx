// TODO(ds): replace with @osc/ui <Backdrop> from feat/ds-components-storybook.
import { useTheme } from "@osc/ui";
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import * as React from "react";
import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";
import { withAlpha } from "@osc/tokens";

/**
 * Full-screen image of the client-branded loading screen, with a legibility gradient (darker at
 * the top and bottom, where the logo, loader and footer sit). Without an image: the plain
 * background.
 */
export function Backdrop({ source }: { source: ImageSourcePropType | null }) {
  const t = useTheme();
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const bg = t.color.background;
  return (
    <View
      style={StyleSheet.absoluteFill}
      className="bg-background"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      pointerEvents="none"
    >
      {source && (
        <>
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            testID="loading-splash"
          />
          {size.w > 0 && (
            <Canvas style={StyleSheet.absoluteFill}>
              <Rect x={0} y={0} width={size.w} height={size.h}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, size.h)}
                  positions={[0, 0.3, 0.55, 1]}
                  colors={[
                    withAlpha(bg, 0.55),
                    withAlpha(bg, 0.1),
                    withAlpha(bg, 0.2),
                    withAlpha(bg, 0.92),
                  ]}
                />
              </Rect>
            </Canvas>
          )}
        </>
      )}
    </View>
  );
}
