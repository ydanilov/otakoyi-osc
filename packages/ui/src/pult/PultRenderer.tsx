import type { ControlValue } from "@osc/controls";
import type { AnyControl, Control, Page } from "@osc/schema";
import * as React from "react";
import { Pressable, ScrollView, View, type ScrollViewInstance } from "react-native";
import { Text } from "@osc/ui/components/ui/text";
import { cn } from "@osc/ui/lib/utils";
import { UnsupportedPlaceholder } from "../controls/discrete";
import { controlRegistry } from "../controls/registry";
import type { ControlProps } from "../controls/types";
import { useLayout } from "../controls/useLayout";
import { useTheme } from "../theme/ThemeProvider";
import { PHONE_BREAKPOINT, paginate, type Cell, type Screen } from "./layout";
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

/** Minimum row height (pt) before a page is split into another screen. */
const MIN_ROW = 40;

interface PagerScreen {
  key: string;
  label: string;
  page: Page;
  screen: Screen;
  cells: Map<string, Cell>;
}

/**
 * The pult body. Pages never scroll vertically: rows stretch to fill the height, and a page that
 * does not fit at the minimum row height is split into several screens. All screens of all pages
 * sit in one horizontal pager; tabs above jump to a screen and follow the swipe.
 */
export function PultPager({ pages, studio = false }: { pages: Page[]; studio?: boolean }) {
  const t = useTheme();
  const { size, onLayout } = useLayout();
  const pad = t.space[4];
  const gap = t.size.gridGap;
  const W = size.width;
  const H = size.height;
  const innerW = Math.max(0, W - pad * 2);
  const innerH = Math.max(0, H - pad * 2);
  const phone = W > 0 && W < PHONE_BREAKPOINT;

  const screens = React.useMemo<PagerScreen[]>(() => {
    if (!innerH) return [];
    const maxRows = Math.max(1, Math.floor((innerH + gap) / (MIN_ROW + gap)));
    return pages.flatMap((page) => {
      // Schema v2: each page carries its own phone and tablet layout (ADR-014).
      const cells = new Map<string, Cell>(Object.entries(page.layout[phone ? "phone" : "tablet"]));
      const split = paginate(cells, maxRows);
      return split.map((screen, i) => ({
        key: `${page.id}:${i}`,
        label: split.length > 1 ? `${page.title} ${i + 1}` : page.title,
        page,
        screen,
        cells,
      }));
    });
  }, [pages, phone, innerH, gap]);

  const scroller = React.useRef<ScrollViewInstance>(null);
  const [index, setIndex] = React.useState(0);
  const go = (i: number) => {
    setIndex(i);
    scroller.current?.scrollTo({ x: i * W, animated: true });
  };
  // Keep the visible screen when the layout changes (rotation, split view).
  React.useEffect(() => {
    if (index >= screens.length && screens.length) setIndex(screens.length - 1);
    scroller.current?.scrollTo({
      x: Math.min(index, Math.max(0, screens.length - 1)) * W,
      animated: false,
    });
  }, [W, screens.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View className="flex-1">
      {screens.length > 1 && (
        <ScreenTabs labels={screens.map((s) => s.label)} index={index} onSelect={go} />
      )}
      <View className="flex-1" onLayout={onLayout}>
        {W > 0 && (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
            onScroll={(e) => {
              // Web has no momentum event; keep tabs in sync while scrolling.
              const i = Math.round(e.nativeEvent.contentOffset.x / W);
              if (i !== index) setIndex(i);
            }}
            scrollEventThrottle={64}
          >
            {screens.map((s) => (
              <View key={s.key} style={{ width: W, height: H, padding: pad }}>
                <ScreenGrid screen={s} width={innerW} height={innerH} gap={gap} studio={studio} />
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function ScreenGrid({
  screen,
  width,
  height,
  gap,
  studio,
}: {
  screen: PagerScreen;
  width: number;
  height: number;
  gap: number;
  studio: boolean;
}) {
  const cols = screen.page.columns;
  const colW = (width - gap * (cols - 1)) / cols;
  const rows = screen.screen.rows;
  const rowH = (height - gap * (rows - 1)) / rows;
  const byId = new Map(screen.page.controls.map((c) => [c.id, c]));
  return (
    <View style={{ width, height }}>
      {screen.screen.ids.map((id) => {
        const c = byId.get(id);
        const g = screen.cells.get(id);
        if (!c || !g) return null;
        return (
          <View
            key={id}
            style={{
              position: "absolute",
              left: g.x * (colW + gap),
              top: (g.y - screen.screen.top) * (rowH + gap),
              width: g.w * colW + (g.w - 1) * gap,
              height: g.h * rowH + (g.h - 1) * gap,
            }}
          >
            <ConnectedControl control={c} studio={studio} />
          </View>
        );
      })}
    </View>
  );
}

/** Tab strip for the screens; scrolls sideways itself when there are many tabs. */
function ScreenTabs({
  labels,
  index,
  onSelect,
}: {
  labels: string[];
  index: number;
  onSelect: (i: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="grow-0"
      contentContainerClassName="gap-1 px-4 pt-3"
    >
      {labels.map((label, i) => {
        const active = i === index;
        return (
          <Pressable
            key={label + i}
            onPress={() => onSelect(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={cn(
              "min-h-10 justify-center rounded-md px-4",
              active ? "bg-secondary" : "active:bg-muted",
            )}
          >
            <Text
              className={cn(
                "text-sm font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
