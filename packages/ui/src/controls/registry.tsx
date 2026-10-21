import type { ControlType } from "@osc/schema";
import type * as React from "react";
import {
  ButtonControl,
  ButtonGrid,
  ColorPicker,
  LabelControl,
  SceneList,
  UnsupportedPlaceholder,
  Segmented,
  ToggleControl,
} from "./discrete";
import { Fader } from "./Fader";
import { HoldToConfirm } from "./HoldToConfirm";
import { Knob } from "./Knob";
import { Meter } from "./Meter";
import type { ControlProps } from "./types";
import { XYPad } from "./XYPad";

/**
 * Control library: schema type → component. Adding a control = schema entry + component + story +
 * logic tests. The type check below fails if a schema type has no component.
 */
export const controlRegistry: { [T in ControlType]: React.ComponentType<ControlProps<T>> } = {
  button: ButtonControl,
  toggle: ToggleControl,
  fader: Fader,
  knob: Knob,
  xy: XYPad,
  segmented: Segmented,
  buttonGrid: ButtonGrid,
  sceneList: SceneList,
  label: LabelControl,
  meter: Meter,
  holdToConfirm: HoldToConfirm,
  colorPicker: ColorPicker,
  // Components for these arrive later on this branch; until then they render as "coming soon".
  buttonGroup: Pending,
  thumbstick: Pending,
  image: Pending,
  mic: Pending,
  prompt: Pending,
};

function Pending<T extends ControlType>({ control }: ControlProps<T>) {
  return (
    <UnsupportedPlaceholder
      control={{ id: control.id, type: "unsupported", originalType: control.type }}
    />
  );
}
