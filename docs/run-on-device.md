# Run the app on your iPhone or Android phone

Two ways: **Expo Go** (no build, the app loads straight from your computer, best for trying
changes) or an **Android APK** built by EAS (installs like a normal app, no computer needed
afterwards). iOS builds for TestFlight need an Apple developer account and are not covered here.

## Expo Go (iPhone and Android)

Verdict for Expo SDK 58: **the app runs in Expo Go.** Every native module it uses is part of Expo
Go, at the version Expo Go ships (`node_modules/expo/bundledNativeModules.json`):

| Module                                                                                                            | Used for                                                                   | In Expo Go                                    |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| `@shopify/react-native-skia` 2.14.0                                                                               | faders, knobs, XY, colour picker, demo preview                             | yes (exact version required, it matches)      |
| `react-native-reanimated` 4.7.1 + `react-native-worklets` 0.13.0                                                  | gestures and animation on the UI thread                                    | yes (matches)                                 |
| `react-native-gesture-handler` ~3.3                                                                               | every control's gestures                                                   | yes                                           |
| `react-native-screens`, `react-native-safe-area-context`, `expo-router`                                           | navigation, sheets                                                         | yes                                           |
| `react-native-svg`                                                                                                | icons                                                                      | yes                                           |
| `expo-camera`                                                                                                     | scanning the pairing QR                                                    | yes (permission text is Expo Go's own)        |
| `expo-secure-store`                                                                                               | the saved pairing (PIN) and preferences                                    | yes                                           |
| `expo-notifications`                                                                                              | Status notifications (local only)                                          | yes for local notifications; push is not used |
| `expo-keep-awake`, `expo-haptics`, `expo-font`, `expo-asset`, `expo-constants`, `expo-linking`, `expo-status-bar` | screen awake, fonts, assets, deep links (haptics: installed, not used yet) | yes                                           |
| `@expo/ui` (SwiftUI menus on iOS)                                                                                 | pull-down / context menus, pop-up selects                                  | yes                                           |

There is no custom native code (no UDP module: the app talks to the bridge over WebSocket), so
nothing needs a development build today. `src/lib/runtime.ts` exports `inExpoGo`
(`expo-constants` `executionEnvironment === "storeClient"`); Settings › App version shows
"· Expo Go" when it is set, and anything that ever needs a development build must check it and
degrade instead of crashing.

What is different in Expo Go:

- **Permission prompts** (camera, local network, notifications) show Expo Go's wording, not the
  strings in `app.json`. The app's own icon, name and splash are not used either.
- **Status notifications** work (they are local notifications). Expo Go prints a warning that
  push notifications are not supported; the app does not use push.
- **Photos and the microphone** (image and mic controls) are not wired on native yet, in Expo Go or
  in a build (`src/lib/platform/media.ts`); they work in the web pult.
- Expo Go from the App Store / Play Store only runs the **current** SDK. If the store's Expo Go is
  newer than SDK 58, use an APK (below) or a development build.

### Steps

1. Install **Expo Go** from the App Store or Google Play.
2. Phone and computer on the **same Wi-Fi** (and, to control a real installation, the same
   network as the bridge). On Windows, allow Node.js through the firewall when asked.
3. On the computer, from the repo root:

   ```bash
   pnpm install
   pnpm --filter @osc/mobile start
   ```

4. Scan the QR in the terminal: on iPhone with the **Camera** app, on Android from **Expo Go**
   (Scan QR code). The app opens in Expo Go.
5. Different networks, a VPN, or a guest Wi-Fi that blocks devices from seeing each other: start
   with a tunnel instead and scan again.

   ```bash
   pnpm --filter @osc/mobile exec expo start --tunnel
   ```

   The tunnel only carries the JavaScript bundle. The app still connects to the bridge directly,
   so for a real installation the phone must reach the bridge's address. **Try the demo** on the
   Connect screen works anywhere.

Edits on the computer reload the app on the phone. Shake the phone for the developer menu.

## Android APK with EAS

An APK installs on any Android phone without Expo Go. EAS builds it in the cloud (no Android
Studio needed). `apps/mobile/eas.json` has a `preview` profile that produces an APK
(`android.buildType: "apk"`, internal distribution).

1. Create a free account at expo.dev. For the command line, either log in once
   (`npx eas-cli@latest login`) or create an access token (expo.dev › Account settings › Access
   tokens) and set it for the shell: `EXPO_TOKEN=<token>` (PowerShell: `$env:EXPO_TOKEN="<token>"`).
   Never commit the token.
2. First time only, link the project (adds `extra.eas.projectId` to `app.json`; commit that):

   ```bash
   cd apps/mobile
   npx eas-cli@latest init
   ```

3. Build:

   ```bash
   cd apps/mobile
   npx eas-cli@latest build -p android --profile preview
   ```

   EAS uploads the repo, installs with pnpm and builds. It asks to generate an Android keystore
   the first time; let it (EAS keeps it).

4. When the build finishes, open its link on the phone (or scan the QR the CLI prints), download
   the APK and install it (allow "install unknown apps" for the browser). With a cable:
   `adb install <file>.apk`.

Notes: Android is not shipped yet (ADR-003) but must keep compiling (AGENTS.md rule 5), so an APK
is also the quickest Android check. Local network discovery and other Android-specific behaviour
have not been tried on a device.
