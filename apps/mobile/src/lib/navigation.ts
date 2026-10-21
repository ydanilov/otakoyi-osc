import { router } from "expo-router";

/** Close the sheet this screen is in (back to whatever is under it). */
export function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** Close every sheet and modal, then go to `to` (e.g. back to Connect after Forget). */
export function resetTo(to: "/connect" | "/loading" | "/pult") {
  if (router.canDismiss()) router.dismissAll();
  router.replace(to);
}
