import type { Notifier } from "../notifications";

/** Web pult: no status notifications (Settings shows the switch disabled with a caption). */
export const notifier: Notifier = {
  supported: false,
  permission: async () => "denied",
  request: async () => "denied",
  show: async () => {},
};
