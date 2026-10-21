# 012 — Pairing by QR, no client accounts

**Status:** Accepted

**Context.** The app is free and is only useful next to an installation. Clients never need to
control it from home; only the studio needs remote access.

**Decision.**

- **No client login.** A device joins an installation by scanning the pairing QR shown on the
  installation's own output. The bridge serves `/pair` (only to its own machine, since it shows the
  PIN) with two QR codes per network address: the app deep link
  `otakoyi-control://connect?bridge=ws://…/ws&pin=…&name=…` and the web pult URL. The app stores the
  pairing (Keychain via SecureStore) and reconnects to it on launch.
- Pairing mode is switched on by the studio or on site (Ctrl+Shift+P) and closes after 2 minutes, so
  the PIN is not on a public screen.
- **Fallbacks:** "Enter address and PIN" (both are printed under the QR) for when the camera cannot
  scan; mDNS (`_otakoyi._tcp`) for in-app discovery.
- **Revoking access:** changing the installation PIN disconnects every paired device.
- **Remote access is studio-only**, through the studio key (and later the studio cloud). Clients
  control the installation only on its local network.
- **Demo mode:** "Try the demo" runs a simulated installation inside the app (an in-process bridge
  with the demo config that answers feedback and telemetry and shows an animated preview). It is what
  App Review and prospective clients use; no account or hardware needed.

**Consequences.** No accounts, passwords or backend for clients; the cloud backend is only needed
for studio remote access and config updates, and can come after the first release. The first screen
is Connect (scan QR / enter address / demo), then the client-branded loading screen, then the pult.
