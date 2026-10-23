import type { MotionInput } from "@osc/ui";
import { DeviceMotion } from "expo-sensors";
import { Linking } from "react-native";

const deg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Native (iOS / Android) device motion for the gyroscope control: expo-sensors `DeviceMotion`
 * (bundled in Expo Go). `rotation.beta` / `rotation.gamma` are the pitch / roll in radians with
 * the same axes as the web's DeviceOrientation; @osc/controls maps them. iOS asks for Motion &
 * Fitness (NSMotionUsageDescription, set through the expo-sensors plugin in app.json).
 */
export const motionInput: MotionInput = {
  available: true,
  async permission() {
    try {
      const p = await DeviceMotion.getPermissionsAsync();
      return p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied";
    } catch {
      return "undetermined";
    }
  },
  async requestPermission() {
    try {
      return (await DeviceMotion.requestPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },
  async start({ rateHz }, onSample) {
    if (!(await DeviceMotion.isAvailableAsync()))
      throw new Error("This device has no motion sensor");
    DeviceMotion.setUpdateInterval(Math.round(1000 / Math.max(1, rateHz)));
    const sub = DeviceMotion.addListener((m) => {
      if (m.rotation) onSample({ pitch: deg(m.rotation.beta), roll: deg(m.rotation.gamma) });
    });
    return () => sub.remove();
  },
  openSettings: () => void Linking.openSettings(),
};
