import type { AudioInput, ImagePicker } from "@osc/ui";

/**
 * Native (iOS / Android) image picking and microphone capture for the image and mic controls.
 *
 * TODO(native-media): not wired yet. It needs native modules (`npx expo install expo-image-picker`
 * for photos, and a capture module that delivers PCM blocks + FFT for the mic — expo-audio only
 * records to files, so this is likely a small custom Expo module). Adding them changes the
 * development build, so it waits until it can be tried on a device. Until then the controls draw,
 * say the feature is not available on this device, and the web pult (media.web.ts) works.
 * Permission strings to add with it: NSPhotoLibraryUsageDescription, NSMicrophoneUsageDescription.
 */
export const imagePicker: ImagePicker = {
  available: false,
  pick: async () => null,
};

export const audioInput: AudioInput = {
  available: false,
  requestPermission: async () => false,
  start: () => Promise.reject(new Error("The microphone isn't available in the app yet")),
};
