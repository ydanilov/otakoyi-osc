import type { AudioInput, ImagePicker, PickedImage } from "@osc/ui";

/**
 * Web pult implementations (Metro picks this file for web): a file input for photos and the Web
 * Audio API for the mic. Analysis (level / bands / beat) happens in @osc/controls; this only
 * delivers samples and FFT magnitudes, and audio never leaves the browser.
 */

const MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  gif: "image/gif",
};

export const imagePicker: ImagePicker = {
  available: typeof document !== "undefined",
  pick: (opts) =>
    new Promise<PickedImage | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      // Choose File: any file (the bridge checks the format by content); otherwise images, and
      // Take Photo asks the browser for the camera where it has one (phones).
      if (opts.source !== "files")
        input.accept = opts.formats.map((f) => MIME[f] ?? `image/${f}`).join(",");
      if (opts.source === "camera") input.setAttribute("capture", "environment");
      input.onchange = () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, body: file, uri: URL.createObjectURL(file) } : null);
      };
      // No "cancel" event everywhere: a later pick simply replaces this promise.
      input.click();
    }),
};

let stream: MediaStream | null = null;

export const audioInput: AudioInput = {
  available: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
  async requestPermission() {
    try {
      stream ??= await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return true;
    } catch {
      return false;
    }
  },
  async start(opts, onBlock) {
    stream ??= await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const timer = setInterval(
      () => {
        analyser.getFloatTimeDomainData(samples);
        analyser.getByteFrequencyData(bins);
        onBlock({ samples, spectrum: Array.from(bins, (b) => b / 255), at: performance.now() });
      },
      1000 / Math.max(1, opts.rateHz),
    );
    return () => {
      clearInterval(timer);
      source.disconnect();
      void ctx.close();
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };
  },
};
