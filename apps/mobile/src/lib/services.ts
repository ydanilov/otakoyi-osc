import type { BridgeHttp } from "@osc/protocol";
import { createMemoryServices, type ControlServices } from "@osc/ui";
import { resolveAsset } from "./assets";
import { DEMO_ASSETS } from "./demo";
import { audioInput, imagePicker } from "./platform/media";
import { motionInput } from "./platform/motion";
import { prefsStorage } from "./platform/storage";

/**
 * Services for a pult connected to a bridge — real or simulated, both answer the same HTTP API
 * (`BridgeHttp`): media and prompt presets live on the bridge, which sends the OSC.
 */
export function bridgeServices(
  http: BridgeHttp,
  assets: { httpBase?: string | undefined; demo?: boolean } = {},
): Omit<ControlServices, "pult"> {
  const opts = { httpBase: assets.httpBase, bundled: assets.demo ? DEMO_ASSETS : undefined };
  return {
    // Picture pads: the config's asset bundle (bridge `/brand/`, or bundled for the demo).
    asset: (path) => resolveAsset(path, opts),
    imagePicker,
    audio: audioInput,
    motion: motionInput,
    viewPrefs: prefsStorage,
    media: {
      remote: true,
      list: http.images.list,
      upload: (pult, control, img) => http.images.upload(pult, control, img.body, img.name),
      show: http.images.show,
      remove: http.images.remove,
    },
    prompts: { ...http.prompts, remote: true },
  };
}

/** The control gallery: everything in memory, nothing leaves the device. */
export function galleryServices(): Omit<ControlServices, "pult"> {
  const { media, prompts } = createMemoryServices();
  return {
    asset: (path) => resolveAsset(path, { bundled: DEMO_ASSETS }),
    imagePicker,
    audio: audioInput,
    motion: motionInput,
    viewPrefs: prefsStorage,
    media,
    prompts,
  };
}
