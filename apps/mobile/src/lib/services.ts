import type { BridgeHttp } from "@osc/protocol";
import { createMemoryServices, type ControlServices } from "@osc/ui";
import { audioInput, imagePicker } from "./platform/media";

/**
 * Services for a pult connected to a bridge — real or simulated, both answer the same HTTP API
 * (`BridgeHttp`): media and prompt presets live on the bridge, which sends the OSC.
 */
export function bridgeServices(http: BridgeHttp): Omit<ControlServices, "pult"> {
  return {
    imagePicker,
    audio: audioInput,
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
  return { imagePicker, audio: audioInput, media, prompts };
}
