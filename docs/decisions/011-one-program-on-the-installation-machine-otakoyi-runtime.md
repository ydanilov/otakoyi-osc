# 011 — One program on the installation machine: Otakoyi Runtime

**Status:** Accepted

**Context.** A client must not run "the installation" and "the bridge" as two programs. TouchDesigner
cannot export a standalone .exe/.app: a project (.toe) runs in TouchDesigner or TouchPlayer (perform
mode, no editor), and the machine needs a TouchDesigner licence. Projects can be packed into the .toe
with TD's virtual file system (VFS).

**Decision.** The client gets one installer and sees one program, **Otakoyi Runtime** (macOS .pkg,
Windows installer), which contains:

- the bridge, compiled to a native binary (no Node on the machine);
- the installation project (.toe, assets packed with VFS where possible);
- a supervisor in the bridge process that starts TouchDesigner/TouchPlayer with the project in perform
  mode, watches it (heartbeat over OSC, process alive), restarts it on a crash, and runs the schedule;
- the pult web app and the pairing page (`/pair`).

The installer installs the matching TouchDesigner build (silent install) and the licence key, registers
the runtime as a service (launchd / Windows service) so it starts with the machine, and opens the
pairing page once. The runtime reports TD status to the studio (telemetry) like any target.

**Consequences.** The bridge grows a "process supervisor" module behind an interface (no TD specifics in
the core). TD version and licence become part of the installation record. Code signing (Apple
Developer ID, Windows code signing) is required before shipping to clients. Until then the studio
installs TD and the bridge by hand.
