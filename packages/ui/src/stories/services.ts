import { createMemoryServices, urlAsset, type ControlServices } from "../platform/services";
import { SAMPLE_PAD, SAMPLE_WALL } from "./images";

/**
 * Control services for stories: in-memory media and prompt presets (like the demo installation),
 * an image picker that returns the sample wall image, and a synthetic microphone (a pulsing tone),
 * so image, prompt and mic controls are fully interactive in Storybook without a device.
 */
export function storyServices(): ControlServices {
  const { media, prompts } = createMemoryServices("stories");
  return {
    pult: "stories",
    // The demo config's picture pad image; anything else only as an http(s) URL.
    asset: (path) => (path === "demo-pad.jpg" ? SAMPLE_PAD : urlAsset(path)),
    media,
    prompts,
    imagePicker: {
      available: true,
      pick: async () => {
        const res = await fetch(SAMPLE_WALL.uri);
        return { name: "sample-wall.png", body: await res.blob(), uri: SAMPLE_WALL.uri };
      },
    },
    audio: {
      available: true,
      requestPermission: async () => true,
      start: async ({ rateHz, bands }, onBlock) => {
        let t = 0;
        const id = setInterval(() => {
          t += 1;
          const amp = 0.25 + 0.5 * Math.abs(Math.sin(t / 6));
          const samples = Array.from({ length: 256 }, (_, i) => amp * Math.sin((i + t * 7) / 4));
          const spectrum = Array.from({ length: bands * 4 }, (_, i) =>
            Math.max(0, amp * (1 - i / (bands * 4)) + 0.15 * Math.sin(t / 3 + i)),
          );
          onBlock({ samples, spectrum, at: Date.now() });
        }, 1000 / rateHz);
        return () => clearInterval(id);
      },
    },
  };
}
