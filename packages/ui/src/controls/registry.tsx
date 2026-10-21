import type { ControlType } from "@osc/schema";
import type * as React from "react";
import {
  ButtonControl,
  ButtonGrid,
  ColorPicker,
  LabelControl,
  SceneList,
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
};
