import type { BrandInput } from "@osc/tokens";

/**
 * Brands used by Storybook's brand switcher. Same sample clients as the `/gallery` screen in the app,
 * so a component looks the same in both review surfaces. The mode (dark / light) is a separate toggle.
 */
export const STORY_BRANDS = {
  otakoyi: { name: "Otakoyi (default)", brand: {} as BrandInput },
  clientA: { name: "Client A · orange", brand: { primary: "#FF5A1F", accent: "#FFD23F" } },
  clientB: { name: "Client B · blue", brand: { primary: "#3D5AFE", accent: "#00BFA5" } },
} as const satisfies Record<string, { name: string; brand: BrandInput }>;

export type StoryBrandId = keyof typeof STORY_BRANDS;
