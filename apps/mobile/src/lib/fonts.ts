import { Inter_400Regular } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";

/**
 * Token fonts (`font.family` in tokens.json) under the names the tokens use, so `font-sans` /
 * `font-mono` resolve on every platform. Figma: Inter (Regular / Medium / Semi Bold / Bold) and
 * JetBrains Mono Regular for values.
 */
export const BASE_FONTS = { Inter: Inter_400Regular, "JetBrains Mono": JetBrainsMono_400Regular };

/** Native: the other weights need no registration here (the system draws the base face). */
export async function loadFontWeights(): Promise<void> {}
