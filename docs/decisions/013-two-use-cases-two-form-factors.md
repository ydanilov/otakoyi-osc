# 013 — Two use cases, two form factors

**Status:** Accepted

**Context.** The same installation can be run in two very different ways, and the pult has to fit
each of them.

**Decision.**

- **Lobby / office / permanent installation** — the pult is a stylish, convenient controller for
  everyday use: few controls, scenes and modes, safe actions. Usually used on a **phone**.
- **Live event** — the pult is a **VJ console** for that installation: dense layout, absolute and
  relative controls, faders, knobs, thumbsticks, cue/layer groups, fine mode. Usually used on a
  **tablet**.
- **Every delivery ships both layouts** — phone and tablet — for the same config, whichever use case
  it is. The config marks the primary form factor (phone for lobby, tablet for live), and the studio
  designs that one first.

**Consequences.** Pult layouts are defined per form factor (phone portrait, tablet landscape) in the
config; `paginate` runs per form factor. Figma has a phone and a tablet frame for every screen of
the app and for every client pult. QA checks both before a delivery.

**Navigation and depth.**

- The pult screen shows only the controls and a minimal header (connection status, view-only /
  studio banners). Everything else lives in two swipe drawers, which may scroll vertically:
  - **left edge → Settings**: appearance, control preferences, pairing QR, what's new, help, sign out;
  - **right edge → Installation**: installation name and status, pult switcher, quick actions
    (Flash, Restart and Blackout with hold-to-confirm), modes (Idle — stop reacting to people;
    Pause — optional per installation).
- **Take control** is not in a drawer: while a device is view-only, every pult screen shows the
  "View only — Take control" banner in the header.
- Depth in the UI is meaningful: **inset** = active/pressed state or the bed under a control
  (tracks, toggle beds, inputs, tab bars); **raised** = interactive elements and top-level cards and
  panels; **flat** = information nested inside a card (chips, stat tiles, icon wells). Neon glow
  appears only on lit values and on press — never on resting buttons.
