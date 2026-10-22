/**
 * Library component → exporter role. Component and variant names are exporter API (ADR-014):
 * renaming a component in the Figma library needs an update here in the same PR.
 *
 * - `control`: the instance becomes one schema control (`type`).
 * - `container`: the exporter looks inside; an OSC annotation on it is shared by the controls in it.
 * - `chrome`: app chrome and decoration drawn by the app itself; skipped with its children.
 */

export type ComponentRole =
  | { role: "control"; type: string; note?: string }
  | { role: "container"; note?: string }
  | { role: "chrome" };

const control = (type: string, note?: string): ComponentRole => ({ role: "control", type, note });
const container = (note?: string): ComponentRole => ({ role: "container", note });
const chrome: ComponentRole = { role: "chrome" };

export const COMPONENTS: Record<string, ComponentRole> = {
  // Controls (packages/ui/src/controls)
  Fader: control("fader", "Mode=Absolute|Relative|Crossfade → mode; Orientation → orientation"),
  Knob: control("knob", "Mode=Absolute|Relative|Color → mode absolute|relative|hue; Size → size"),
  "XY Pad": control("xy"),
  Thumbstick: control("thumbstick"),
  Meter: control("meter", "address = feedback"),
  Toggle: control("toggle", "style button; Size → size"),
  Switch: control("toggle", "style switch"),
  "List Row": control("toggle", "Trailing=Switch only: style switch, label = Title"),
  "Group Button": control("toggle", "outside a Button Group (e.g. a channel strip's power)"),
  Pad: control("button", "Size → size"),
  Button: control("button"),
  "Hold to Confirm": control("holdToConfirm"),
  Segmented: control("segmented", "inside a Scene Bar: sceneList"),
  "Button Group": control("buttonGroup", "Group Button children → buttons"),
  "Button Grid": control("buttonGrid"),
  "Scene List": control("sceneList"),
  Label: control("label", "address = feedback"),
  "Color Picker": control("colorPicker"),
  Mic: control("mic", "outputs from the annotated addresses <prefix>/level|bands|beat"),
  "Prompt Presets": control("prompt"),
  "Prompt Mix": control("prompt", "sets blend on the page's prompt control"),
  "Image Upload": control("image"),
  Unsupported: chrome,

  // Containers and patterns (built from config by the pult renderer)
  "Console Panel": container("Title = panel title (fallback id for unnamed controls)"),
  "List Card": container("one toggle per List Row"),
  Section: container(),
  "Fader Bank": container(),
  "Channel Strip": container("fader + power toggle"),
  "Knob Group": container(),
  "Layer Toggles": container(),
  "Camera Control": container(),
  "Scene Bar": container("Segmented inside → sceneList"),
  Mix: container(),
  "Stepper Group": container(),

  // Chrome: drawn by the app, not part of the config
  "Status Bar": chrome,
  "Home Indicator": chrome,
  "Pult Header": chrome,
  "Tab Bar": chrome,
  "Screen Tab": chrome,
  "Page Dots": chrome,
  "Pult Select": chrome,
  "Top Bar": chrome,
  "Nav Item": chrome,
  Connection: chrome,
  "Icon Button": chrome,
  Badge: chrome,
  Divider: chrome,
  Chip: chrome,
  Note: chrome,
  "Info Card": chrome,
  "Stat Tile": chrome,
  Loader: chrome,
  Toast: chrome,
  Scrim: chrome,
  "Brand Mark": chrome,
  Wordmark: chrome,
  "Touch Light": chrome,
  Backdrop: chrome,
  "Client Logo": chrome,
  "Prompt Preset": chrome,
  "Prompt Field": chrome,
  "Master Bar": chrome,
  "Quick Action": chrome,
  "Installation Actions": chrome,
  "Debug Row": chrome,
  "OSC Log": chrome,
  "Debug Tag": chrome,
  "Debug HUD": chrome,
};

export function roleOf(component: string | undefined): ComponentRole | undefined {
  if (!component) return undefined;
  if (component.startsWith("Icon/")) return chrome;
  return COMPONENTS[component];
}
