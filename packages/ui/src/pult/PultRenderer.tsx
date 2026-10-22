import { debugAddress, formatRate, type ControlValue, type DebugStore } from "@osc/controls";
import type { AnyControl, Control, Page } from "@osc/schema";
import * as React from "react";
import { ScrollView, View, type ScrollViewInstance } from "react-native";
import { ScreenTab } from "../chrome/Navigation";
import { PageDots } from "../chrome/Status";
import { UnsupportedPlaceholder } from "../controls/discrete";
import { DebugTag, useTicker } from "../debug/Debug";
import { Surface } from "../ds/depth";
import { controlRegistry } from "../controls/registry";
import type { ControlProps } from "../controls/types";
import { useLayout } from "../controls/useLayout";
import { useTheme } from "../theme/ThemeProvider";
import { PHONE_BREAKPOINT, minHeightFor, paginate, type Cell, type Screen } from "./layout";

import { useControlMode, useControlValue, usePultStore } from "./context";

export {
  PultProvider,
  useControlMeta,
  useControlMode,
  useControlValue,
  usePultStore,
} from "./context";

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

/** Debug tag of one control: address, last value sent, send rate (re-read a few times a second). */
function ControlDebugTag({ control, debug }: { control: AnyControl; debug: DebugStore }) {
  useTicker(250);
  if (control.type === "unsupported") return null;
  const s = debug.control(control.id);
  return (
    <DebugTag
      address={debugAddress(control)}
      value={s?.value}
      rate={`${formatRate(s?.rate ?? 0)}/s`}
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
export function PultPager({
  pages,
  studio = false,
  debug,
}: {
  pages: Page[];
  studio?: boolean;
  /** Debug overlay on: every control shows its DebugTag (Settings › Developer). */
  debug?: DebugStore | null | undefined;
}) {
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
      // Picture pads and sized pads keep their Figma size: a band that would squeeze them moves
      // to the next screen.
      const minHeight = new Map<string, number>();
      for (const c of page.controls) {
        const m = minHeightFor(c, t.size);
        if (m !== undefined) minHeight.set(c.id, m);
      }
      const split = paginate(cells, maxRows, { height: innerH, gap, minHeight });
      return split.map((screen, i) => ({
        key: `${page.id}:${i}`,
        label: split.length > 1 ? `${page.title} ${i + 1}` : page.title,
        page,
        screen,
        cells,
      }));
    });
  }, [pages, phone, innerH, gap, t.size]);

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
        <ScreenTabs labels={screens.map((s) => s.label)} index={index} onSelect={go} fill={phone} />
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
                <ScreenGrid
                  screen={s}
                  width={innerW}
                  height={innerH}
                  gap={gap}
                  studio={studio}
                  debug={debug}
                />
              </View>
            ))}
          </ScrollView>
        )}
      </View>
      {screens.length > 1 && (
        <View className="items-center pb-2" pointerEvents="none">
          <PageDots count={screens.length} active={Math.min(index, screens.length - 1)} />
        </View>
      )}
    </View>
  );
}

function ScreenGrid({
  screen,
  width,
  height,
  gap,
  studio,
  debug,
}: {
  screen: PagerScreen;
  width: number;
  height: number;
  gap: number;
  studio: boolean;
  debug?: DebugStore | null | undefined;
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
            {debug && (
              <View
                pointerEvents="none"
                style={{ position: "absolute", left: -2, top: -4, right: 0 }}
              >
                <ControlDebugTag control={c} debug={debug} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Screen tabs: the DS Tab Bar — a recessed capsule track with an inset capsule thumb. Phone: the
 * tabs share the full width; tablet: the bar hugs its tabs. Scrolls sideways when there are many.
 */
function ScreenTabs({
  labels,
  index,
  onSelect,
  fill,
}: {
  labels: string[];
  index: number;
  onSelect: (i: number) => void;
  fill: boolean;
}) {
  const many = labels.length > (fill ? 4 : 8);
  const tabs = labels.map((label, i) => (
    <View key={label + i} style={fill && !many ? { flex: 1, minWidth: 0 } : { minWidth: 96 }}>
      <ScreenTab
        label={label}
        active={i === index}
        onPress={() => onSelect(i)}
        fill={fill && !many}
      />
    </View>
  ));
  return (
    <View className="px-4 pt-3">
      <Surface
        depth="inset"
        radius="full"
        className={fill ? "self-stretch" : "self-start"}
        accessibilityRole="tablist"
      >
        {many ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-1 p-1"
          >
            {tabs}
          </ScrollView>
        ) : (
          <View className="flex-row gap-1 p-1">{tabs}</View>
        )}
      </Surface>
    </View>
  );
}
