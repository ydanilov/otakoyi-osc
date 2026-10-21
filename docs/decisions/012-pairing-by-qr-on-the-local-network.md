# 012 — Pairing by QR on the local network

**Status:** Accepted

**Decision.** The bridge serves `/pair` (only to its own machine, since it shows the PIN) with two QR
codes per network address: the app deep link `otakoyi-control://connect?bridge=ws://…/ws&pin=…&name=…`
and the web pult URL. Scanning with the phone camera opens the app, which stores the pairing (Keychain
via SecureStore) and connects. The bridge also advertises `_otakoyi._tcp` over mDNS for in-app discovery
later. Cloud login with a one-time magic link replaces the PIN when the cloud exists; a magic link can
not survive an App Store install, so the first screen also accepts the QR.
