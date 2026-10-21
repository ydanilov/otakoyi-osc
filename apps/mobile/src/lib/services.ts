import { createBridgeHttp, httpBaseOf } from "@osc/protocol";
import { createMemoryServices, type ControlServices } from "@osc/ui";
import { audioInput, imagePicker } from "./platform/media";

/** Services for a pult connected to a bridge: media and prompt presets over the bridge's HTTP API. */
export function bridgeServices(
  socketUrl: string,
  device: string,
  secret: string | undefined,
): Omit<ControlServices, "pult"> {
  const http = createBridgeHttp({ base: httpBaseOf(socketUrl), device, secret });
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

/** Demo installation / gallery: everything in memory, nothing leaves the device. */
export function demoServices(): Omit<ControlServices, "pult"> {
  const { media, prompts } = createMemoryServices();
  return { imagePicker, audio: audioInput, media, prompts };
}
