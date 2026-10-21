# 001 — Config, not binaries

**Status:** Accepted

**Decision.** One app (“Otakoyi Control”) in the App Store. After login the app downloads the
installation's config (JSON, zod-validated, `schemaVersion` + `revision`) and renders it from the
built-in control library. White-label binaries only as a paid exception.

**Consequences.** Pult changes ship in minutes without App Review. New control types need an app
release; older apps show an “Update the app” placeholder for unknown types and keep working.
