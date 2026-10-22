import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import { Asset } from "expo-asset";

/** See fonts.ts. */
export const BASE_FONTS = { Inter: Inter_400Regular, "JetBrains Mono": JetBrainsMono_400Regular };

/**
 * Web: expo-font registers one face per family name, so `font-medium` / `font-semibold` would
 * fall back to the regular face. Register the Figma weights as faces of the same family.
 */
export async function loadFontWeights(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  const faces: Array<[string, string, number]> = [
    ["Inter", "500", Inter_500Medium],
    ["Inter", "600", Inter_600SemiBold],
    ["Inter", "700", Inter_700Bold],
    ["JetBrains Mono", "500", JetBrainsMono_500Medium],
  ];
  await Promise.all(
    faces.map(async ([family, weight, mod]) => {
      try {
        const face = new FontFace(family, `url(${Asset.fromModule(mod).uri})`, { weight });
        document.fonts.add(await face.load());
      } catch {
        // A missing weight falls back to the regular face.
      }
    }),
  );
}
