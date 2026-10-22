# 001 — Config, not binaries

**Status:** Accepted

**Decision.** One app (“Otakoyi Control”) in the App Store. After pairing with an installation (ADR-012) the app gets the
installation's config from its bridge (JSON, zod-validated, `schemaVersion` + `revision`) and renders it from the
built-in control library. White-label binaries only as a paid exception.

**Consequences.** Pult changes ship in minutes without App Review. New control types need an app
release; older apps show an “Update the app” placeholder for unknown types and keep working.
