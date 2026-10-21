// TODO(ds): replace with @osc/ui <ClientLogo> from feat/ds-components-storybook.
import { Text } from "@osc/ui/components/ui/text";
import * as React from "react";
import { Image, type ImageSourcePropType } from "react-native";

/** The client's logo from the config (`theme.logo`); the installation name when there is none. */
export function ClientLogo({
  source,
  name,
  height = 56,
}: {
  source: ImageSourcePropType | null;
  name: string;
  height?: number;
}) {
  const [failed, setFailed] = React.useState(false);
  if (source && !failed)
    return (
      <Image
        source={source}
        onError={() => setFailed(true)}
        style={{ height, width: height * 3.6 }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={name}
        testID="client-logo"
      />
    );
  return (
    <Text className="text-foreground text-center text-2xl font-semibold" accessibilityRole="header">
      {name}
    </Text>
  );
}
