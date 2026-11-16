import type { Page } from "@osc/schema";
import * as React from "react";
import { View } from "react-native";
import { Note } from "../chrome/Status";
import { Section } from "../containers/Cards";
import { ConnectedControl } from "../pult/ConnectedControl";
import { itemsFor } from "../pult/layout";
import { useTheme } from "../theme/ThemeProvider";

/** Height for a control without a natural one (stretchy controls in a stacked list). */
const STACK_HEIGHT = 96;

/**
 * Pattern `Setup Screen`: the one-off parameters of an installation (TouchDesigner `[setup]`) in the
 * Installation panel, below System. A Setup pult's controls stacked one per row at their natural
 * height, one section per page (captioned only when there are several pages). Controls sit on the
 * sheet directly, like on the pult, so a raised control is never nested in a raised panel. Lives in a sheet or
 * inspector, so it may scroll; it is never on the pult screen. Needs a `PultProvider` with the Setup
 * pult's store: values, lease and echo work as on any pult.
 */
export function SetupScreen({ pages, readOnly }: { pages: Page[]; readOnly?: boolean }) {
  const t = useTheme();
  return (
    <View className="gap-4 self-stretch" testID="setup-screen">
      {pages.map((page) => {
        const items = itemsFor(page.controls, [], t.size);
        return (
          <PageBlock key={page.id} title={pages.length > 1 ? page.title : undefined}>
            {page.controls.map((c) => {
              const it = items.get(c.id);
              const h = it?.height ?? it?.min ?? STACK_HEIGHT;
              return (
                <View key={c.id} style={{ height: h }} testID={`setup-${c.id}`}>
                  <ConnectedControl control={c} studio={false} />
                </View>
              );
            })}
          </PageBlock>
        );
      })}
      {readOnly && <Note>Take control to change the setup.</Note>}
    </View>
  );
}

function PageBlock({ title, children }: { title?: string; children: React.ReactNode }) {
  const list = <View className="gap-4">{children}</View>;
  return title ? <Section title={title}>{list}</Section> : list;
}
