# Figma export — Client · Phase One (D2HHS8lt7PxZqxibv9PlOQ)

Schema: **valid** · pult `phase-one` · 3 pages · 23 controls · 1 errors · 11 warnings · 22 notes · 40 screens skipped

| Page | Title | Phone frame | Tablet frame | Controls |
| --- | --- | --- | --- | --- |
| `live-1` | Live 1 | Phone / 04 Pult — in control (52:1209) | — | 6 |
| `prompts` | Prompts | Phone / 12 Prompts — live (109:11394) | Tablet / 12 Prompts — live (109:13460) | 2 |
| `mix` | Mix | — | Tablet / 04 VJ console — in control (54:1012) | 15 |

## Errors (1)

- `missing-address` tablet/mix — zoom-nudge (Fader Mode=Relative): no OSC address — add an "OSC" annotation to the instance or its container [I54:1820;51:689;51:794]

## Warnings (11)

- `tabs-disagree` — phone tab bars differ between frames: [Live 1 | Live 2 | Scenes] vs [Live | Scenes | Prompts]
- `tab-without-frame` — phone tabs without a pult frame (not exported): Live 2, Scenes, Live
- `tabs-disagree` — tablet tab bars differ between frames: [Mix | FX | Cues | Scenes] vs [Mix | FX | Cues | Prompts]
- `tab-without-frame` — tablet tabs without a pult frame (not exported): FX, Cues, Scenes
- `option-count` phone/live-1 — scene: 4 options in Figma, 3 values in the OSC annotation (ambient, react, show); exported 3 [52:1235]
- `prompt-mix-address` phone/prompts — prompts: Prompt Mix is annotated /prompt/mix, but a blending prompt sends /prompt/text/a, /b and /prompt/text/mix (schema); fix the annotation or the installation [109:11597]
- `prompt-mix-address` tablet/prompts — prompts: Prompt Mix is annotated /prompt/mix, but a blending prompt sends /prompt/text/a, /b and /prompt/text/mix (schema); fix the annotation or the installation [109:14039]
- `draft-annotation` — 14 OSC annotations are marked draft — confirm them against the installation's otakoyi/osc-contract.json: Segmented, List Card, Fader, Prompt Presets, Prompt Mix, Fader Bank, Knob Group, Layer Toggles, Camera Control, Scene Bar, Mic
- `missing-form-factor` tablet/live-1 — page "Live 1" has no tablet frame; tablet layout copied from the phone frame
- `not-on-form-factor` phone/prompts — room-sound not in the phone frame of "Prompts"; appended full-width at the bottom of the phone layout [109:11394]
- `missing-form-factor` phone/mix — page "Mix" has no phone frame; phone layout reflowed from the tablet frame

## Notes (22)

- `frame-skipped` — "Phone / 05 Pult — view only" skipped (Pult Header Mode=View) [52:1479]
- `icon-options` phone/live-1 — scene: icon-only options; labels derived (Ambient, React, Show) — the app needs text for accessibility [52:1235]
- `depends-on-note` phone/live-1 — "Segmented": Single-select: exactly one mode is lit. Icons map 1:1 to the option values. [52:1235]
- `depends-on-note` phone/live-1 — "List Card": Each row is an independent toggle. Audio react needs the installation's audio input; without it the row is hidden. [52:1252]
- `depends-on-note` phone/live-1 — "Fader": Double-tap resets to default 0.6. Hidden while Blackout is on. [52:1355]
- `depends-on-note` phone/live-1 — "Fader": Value comes back from the installation; the pult never jumps to the finger. [52:1368]
- `depends-on-note` phone/prompts — "Prompt Presets": Presets live in the bridge (not the config): create, edit, reorder, soft delete with Undo. Applying → Error after 4 s without confirmation. Lease holder or studio only. [109:11568]
- `depends-on-note` phone/prompts — "Prompt Mix": Needs two presets; "Use in mix" from the context menu fills A/B. [109:11597]
- `icon-options` tablet/mix — scene: icon-only options; labels derived (Lightning, Sun, Moon, Circle half) — the app needs text for accessibility [I63:3413;51:619;51:658]
- `crossfade-seconds` tablet/mix — scene: crossfade mentioned without seconds (add crossfade=<s>); not exported [I63:3413;51:619;51:658]
- `id-suffixed` tablet/mix — 4 controls named "power" → power-1, power-2, power-3, power-4; rename the layers to choose ids
- `depends-on-note` tablet/mix — "Fader Bank": Strip off → fader dims and stops sending; the value is kept and resent when switched back on. [54:1053]
- `depends-on-note` tablet/mix — "Knob Group": Knob ids = layer names in Figma (Inspector). Hue knob sends degrees 0–360. [54:1356]
- `depends-on-note` tablet/mix — "Layer Toggles": Any number of layers can be on; LED strip shows the live state from feedback. [54:1749]
- `depends-on-note` tablet/mix — "Camera Control": Only while the installation runs the camera scene; otherwise the panel shows Unsupported. [54:1820]
- `depends-on-note` tablet/mix — "Scene Bar": Scene list comes from the config; renaming a scene in Figma renames it for the client. [63:3413]
- `depends-on-note` tablet/prompts — "Prompt Presets": Presets live in the bridge (not the config): create, edit, reorder, soft delete with Undo. Applying → Error after 4 s without confirmation. Lease holder or studio only. [109:14009]
- `depends-on-note` tablet/prompts — "Mic": Microphone permission on the device; audio never leaves the phone — only numbers are sent. [109:14092]
- `depends-on-note` tablet/prompts — "Prompt Mix": Needs two presets; "Use in mix" from the context menu fills A/B. [109:14039]
- `default-layer-names` — 21 control layers keep the component name, so ids were derived from labels / panel titles: scene (Segmented), logo (List Row), live-data (List Row), audio-react (List Row), brightness (Fader), hue-drift (Fader), prompts (Prompt Presets), layer-1 (Fader), layer-2 (Fader), layer-3 (Fader), master (Fader), hue-shift (Knob), speed (Knob), zoom (Knob), rotate (Knob), layers (Button Group), pan-tilt (Thumbstick), zoom-nudge (Fader), room-sound (Mic) — rename the layers to fix the ids
- `id-renamed` tablet/mix — scene is already used on page "live-1"; renamed to mix-scene (control ids are unique per pult) [I63:3413;51:619;51:658]
- `default-target` — no --base config: targets set to the default (udp 7000, feedback 9000); theme left to the app default
