import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Text } from "../components/ui/text";
import { Surface } from "../ds/depth";
import { cn } from "../lib/utils";
import { useTheme } from "../theme/ThemeProvider";

const MARK = { sm: 40, md: 128, lg: 180 } as const;

/** SVG arc path on a circle, angles in degrees clockwise from 12 o'clock. */
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const p = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cy + r * Math.sin(rad)).toFixed(2)}`;
  };
  const large = to - from > 180 ? 1 : 0;
  return `M ${p(from)} A ${r} ${r} 0 ${large} 1 ${p(to)}`;
}

/**
 * Figma `Brand Mark`: the Otakoyi knob — a raised dial with a lit arc over the 240° travel of
 * the pult knobs. Arc and dot use the brand signal colour, so a client brand recolours it.
 */
export function BrandMark({ size = "md" }: { size?: keyof typeof MARK }) {
  const t = useTheme();
  const s = MARK[size];
  const stroke = Math.max(2, s * 0.05);
  const r = s / 2 - stroke;
  const knob = s * 0.62;
  const tip = -120 + 240 * 0.72;
  const tipRad = ((tip - 90) * Math.PI) / 180;
  const dotR = r - stroke * 2.2;
  return (
    <View
      style={{ width: s, height: s }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Otakoyi"
    >
      <Svg width={s} height={s} style={{ position: "absolute" }}>
        <Path
          d={arc(s / 2, s / 2, r, -120, 120)}
          stroke={t.control.track}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={arc(s / 2, s / 2, r, -120, tip)}
          stroke={t.control.fill}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      {size !== "sm" && (
        <Surface
          depth="raised"
          radius="full"
          style={{
            position: "absolute",
            width: knob,
            height: knob,
            left: (s - knob) / 2,
            top: (s - knob) / 2,
          }}
        />
      )}
      {size !== "sm" && (
        <Svg width={s} height={s} style={{ position: "absolute" }} pointerEvents="none">
          <Circle
            cx={s / 2 + Math.cos(tipRad) * dotR}
            cy={s / 2 + Math.sin(tipRad) * dotR}
            r={stroke * 0.8}
            fill={t.control.fill}
          />
        </Svg>
      )}
    </View>
  );
}

/** Figma `Wordmark`: "otakoyi" + CONTROLS. */
export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <View
      className="items-center"
      accessible
      accessibilityRole="header"
      accessibilityLabel="Otakoyi Controls"
    >
      <Text
        className={cn(
          "text-foreground font-semibold tracking-tight",
          size === "lg" ? "text-display" : "text-lg",
        )}
      >
        otakoyi
      </Text>
      <Text
        className={cn(
          "text-muted-foreground font-medium uppercase",
          size === "lg" ? "text-xs tracking-[3px]" : "text-[8px] tracking-[2px]",
        )}
      >
        Controls
      </Text>
    </View>
  );
}
