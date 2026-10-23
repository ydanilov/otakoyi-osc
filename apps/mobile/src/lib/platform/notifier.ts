import type { Notifier, Permission } from "../notifications";

type ExpoNotifications = typeof import("expo-notifications");

/**
 * Native local notifications through expo-notifications. Loaded on first use, so the module (and
 * its Expo Go warning) costs nothing until the user turns Status notifications on. Local
 * notifications work in Expo Go and in a development / store build; nothing here uses push.
 */
let mod: Promise<ExpoNotifications | null> | null = null;
function load(): Promise<ExpoNotifications | null> {
  mod ??= import("expo-notifications")
    .then(async (N) => {
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      // Android 8+: notifications need a channel.
      await N.setNotificationChannelAsync("status", {
        name: "Installation status",
        importance: N.AndroidImportance.DEFAULT,
      }).catch(() => {});
      return N;
    })
    .catch(() => null);
  return mod;
}

const toPermission = (p: { granted: boolean; canAskAgain: boolean; status: string }): Permission =>
  p.granted ? "granted" : p.status === "undetermined" && p.canAskAgain ? "undetermined" : "denied";

export const notifier: Notifier = {
  supported: true,
  async permission() {
    const N = await load();
    return N ? toPermission(await N.getPermissionsAsync()) : "denied";
  },
  async request() {
    const N = await load();
    if (!N) return "denied";
    return toPermission(
      await N.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: false, allowBadge: false },
      }),
    );
  },
  async show(title, body) {
    const N = await load();
    await N?.scheduleNotificationAsync({
      content: { title, body },
      // Immediately, on the Android channel above (ignored on iOS).
      trigger: { channelId: "status" },
    });
  },
};
