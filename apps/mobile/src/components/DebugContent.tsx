import { Button, CaretLeftIcon, DebugRow, ListCard, OscLog, Section, useTicker } from "@osc/ui";
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { View } from "react-native";
import { useApp, useSessionState } from "@/lib/app-context";
import { debugModel, type DebugMetric } from "@/lib/debug";

/** Separators of Debug Row cards start at the row text (no icons). */
const INSET = 16;

/**
 * Debug page (Figma `20 Debug`): an inset-grouped list pushed inside the Installation sheet
 * (iPhone) or inspector (iPad), and from Settings › Developer › Debug. Sections: Connection,
 * Traffic, Controls (one Debug Row per control on the current pult), OSC log (last 50, newest
 * first) and Versions. It never overlays the pult.
 *
 * The session pings the bridge and polls its health only while this page is mounted; it re-reads
 * the DebugStore four times a second. The container (sheet / inspector) scrolls.
 */
export function DebugContent({ onBack, backLabel }: { onBack?: () => void; backLabel?: string }) {
  const app = useApp();
  const s = useSessionState();
  const session = app.session;
  useTicker(250);

  React.useEffect(() => {
    if (!session) return;
    session.setDebug(true);
    return () => session.setDebug(false);
  }, [session]);

  const pult = s.config?.pults.find((p) => p.id === app.pultId) ?? s.config?.pults[0];
  const m = session
    ? debugModel(s, session.debug, {
        device: session.device,
        bridge: session.bridge,
        demo: session.kind === "demo",
        now: Date.now(),
        pult,
      })
    : null;

  return (
    <View className="gap-6" testID="debug-page">
      {onBack && (
        <View className="flex-row">
          <Button
            label={backLabel ?? "Back"}
            icon={CaretLeftIcon}
            variant="ghost"
            size="sm"
            onPress={onBack}
          />
        </View>
      )}
      {!m ? (
        <Text className="text-muted-foreground py-10 text-center">Not connected.</Text>
      ) : (
        <>
          <Metrics title="Connection" rows={m.connection} />
          <Metrics title="Traffic" rows={m.traffic} />
          {m.controls.length > 0 && (
            <Section title="Controls">
              <ListCard inset={INSET} testID="debug-controls">
                {m.controls.map((c) => (
                  <DebugRow
                    key={c.id}
                    kind="control"
                    label={c.label}
                    address={c.address}
                    value={c.value}
                    rate={c.rate}
                  />
                ))}
              </ListCard>
            </Section>
          )}
          <Section title="OSC log">
            <OscLog lines={m.log} />
          </Section>
          <Metrics title="Versions" rows={m.versions} />
        </>
      )}
    </View>
  );
}

function Metrics({ title, rows }: { title: string; rows: DebugMetric[] }) {
  return (
    <Section title={title}>
      <ListCard inset={INSET}>
        {rows.map((r) => (
          <DebugRow key={r.label} label={r.label} value={r.value} />
        ))}
      </ListCard>
    </Section>
  );
}
