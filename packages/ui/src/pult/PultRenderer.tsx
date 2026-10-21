import type { ControlValue } from "@osc/controls";
import type { AnyControl, Control, Page } from "@osc/schema";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { UnsupportedPlaceholder } from "../controls/discrete";
import { controlRegistry } from "../controls/registry";
import type { ControlProps } from "../controls/types";
import { useLayout } from "../controls/useLayout";
import { useTheme } from "../theme/ThemeProvider";
import { PHONE_BREAKPOINT, reflowForPhone } from "./layout";
import type { ControlMode, PultStore } from "./store";

const StoreContext = React.createContext<PultStore | null>(null);

export function PultProvider({ store, children }: { store: PultStore; children: React.ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function usePultStore(): PultStore {
  const s = React.useContext(StoreContext);
  if (!s) throw new Error("usePultStore must be used inside <PultProvider>");
  return s;
}

export function useControlValue(id: string): ControlValue {
  const store = usePultStore();
  return React.useSyncExternalStore(
    (fn) => store.subscribe(id, fn),
    () => store.get(id),
  );
}

export function useControlMode(): ControlMode {
  const store = usePultStore();
  return React.useSyncExternalStore(
    (fn) => store.subscribeMode(fn),
    () => store.mode,
  );
}

/** One control wired to the store. Studio-only controls are hidden unless the session is a studio session. */
function ConnectedControl({ control, studio }: { control: AnyControl; studio: boolean }) {
  const store = usePultStore();
  const value = useControlValue(control.id);
  const mode = useControlMode();
  const onChange = React.useCallback(
    (v: ControlValue) => store.interact(control, v),
    [store, control],
  );
  if (control.type === "unsupported") return <UnsupportedPlaceholder control={control} />;
  if (control.studioOnly && !studio) return null;
  const Component = controlRegistry[control.type] as React.ComponentType<
    ControlProps<Control["type"]>
  >;
  return (
    <Component
      control={control as never}
      value={value}
      onChange={onChange}
      disabled={mode !== "control"}
    />
  );
}

/**
 * Lays out a page on its 12-column grid. Row height follows the column width (square cells, min 44 pt
 * touch target), so the same config reads correctly on phones and tablets. Tall pages scroll.
 */
export function PultPage({ page, studio = false }: { page: Page; studio?: boolean }) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const gap = t.size.gridGap;
  const cols = page.columns;
  const phone = size.width > 0 && size.width < PHONE_BREAKPOINT;
  const cells = React.useMemo(
    () =>
      phone
        ? reflowForPhone(page.controls, cols)
        : new Map(page.controls.map((c) => [c.id, c.grid])),
    [phone, page.controls, cols],
  );
  const colW = size.width > 0 ? (size.width - gap * (cols - 1)) / cols : 0;
  const rowH = Math.max(t.touch.min, phone ? colW * 1.25 : colW);
  const rows = Math.max(1, ...[...cells.values()].map((g) => g.y + g.h));
  const height = rows * rowH + (rows - 1) * gap;

  return (
    <ScrollView className="flex-1" contentContainerClassName="p-4">
      <View onLayout={onLayout} style={{ height: colW ? height : undefined }}>
        {colW > 0 &&
          page.controls.map((c) => {
            const g = cells.get(c.id) ?? c.grid;
            return (
              <View
                key={c.id}
                style={{
                  position: "absolute",
                  left: g.x * (colW + gap),
                  top: g.y * (rowH + gap),
                  width: g.w * colW + (g.w - 1) * gap,
                  height: g.h * rowH + (g.h - 1) * gap,
                }}
              >
                <ConnectedControl control={c} studio={studio} />
              </View>
            );
          })}
      </View>
    </ScrollView>
  );
}
