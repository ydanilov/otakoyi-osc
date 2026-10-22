import { DebugHud, useTicker } from "@osc/ui";
import * as React from "react";
import { View } from "react-native";
import { hudModel } from "@/lib/debug";
import type { Session, SessionState } from "@/lib/session";

/**
 * The debug HUD at the bottom of the pult (Settings › Developer › Debug overlay). Collapsible;
 * re-reads the session's DebugStore four times a second. Phone: full width; tablet: centred.
 */
export function DebugPanel({
  session,
  state,
  tablet,
}: {
  session: Session;
  state: SessionState;
  tablet: boolean;
}) {
  useTicker(250);
  const [collapsed, setCollapsed] = React.useState(false);
  const m = hudModel(state, session.debug, {
    device: session.device,
    bridge: session.bridge,
    demo: session.kind === "demo",
    now: Date.now(),
  });
  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-6 left-0 right-0 items-center px-4"
      testID="debug-panel"
    >
      <View style={{ width: "100%", maxWidth: tablet ? 560 : undefined }}>
        <DebugHud
          versions={m.versions}
          metrics={m.metrics}
          log={m.log}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          maxLines={tablet ? 6 : 5}
        />
      </View>
    </View>
  );
}
