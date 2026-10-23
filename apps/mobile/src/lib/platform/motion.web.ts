import type { MotionInput } from "@osc/ui";

/**
 * Web pult device motion (Metro picks this file for web): the DeviceOrientation API. Browsers
 * only expose it on secure pages (HTTPS or localhost), and iOS Safari asks for permission, which
 * must happen on a tap — the gyroscope's switch is that tap. A browser that has the API but never
 * fires it (desktops) is reported by `start` rejecting, and the control shows it as unavailable.
 */

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const ctor = (): OrientationCtor | undefined =>
  typeof window !== "undefined" && "DeviceOrientationEvent" in window
    ? (window.DeviceOrientationEvent as OrientationCtor)
    : undefined;

let granted: boolean | null = null;

/** How long to wait for a first reading before calling the sensor missing. */
const FIRST_READING_MS = 1500;

export const motionInput: MotionInput = {
  available: typeof window !== "undefined" && window.isSecureContext && !!ctor(),
  async permission() {
    if (granted !== null) return granted ? "granted" : "denied";
    // Browsers without the iOS permission API never need to ask.
    return ctor()?.requestPermission ? "undetermined" : "granted";
  },
  async requestPermission() {
    const c = ctor();
    if (!c) return false;
    if (!c.requestPermission) return (granted = true);
    try {
      granted = (await c.requestPermission()) === "granted";
    } catch {
      granted = false;
    }
    return granted;
  },
  start({ rateHz }, onSample) {
    return new Promise((resolve, reject) => {
      let latest: { pitch: number; roll: number } | null = null;
      let timer: ReturnType<typeof setInterval> | null = null;
      const onEvent = (e: DeviceOrientationEvent) => {
        if (e.beta === null || e.gamma === null) return;
        const first = latest === null;
        latest = { pitch: e.beta, roll: e.gamma };
        if (first) {
          clearTimeout(watchdog);
          onSample(latest);
          // Events come at the screen rate; deliver the latest at the control's rate.
          timer = setInterval(() => latest && onSample(latest), 1000 / Math.max(1, rateHz));
          resolve(stop);
        }
      };
      const stop = () => {
        window.removeEventListener("deviceorientation", onEvent);
        if (timer) clearInterval(timer);
        clearTimeout(watchdog);
      };
      const watchdog = setTimeout(() => {
        stop();
        reject(new Error("No motion sensor"));
      }, FIRST_READING_MS);
      window.addEventListener("deviceorientation", onEvent);
    });
  },
};
