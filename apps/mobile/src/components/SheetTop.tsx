import { IconButton, TopBar, XIcon } from "@osc/ui";
import * as React from "react";

/**
 * Top of a sheet route: the DS Top Bar (Back when a view is pushed) with Close × trailing — the
 * same placement as the DS Inspector, so iPhone sheets and the iPad inspector read alike.
 */
export function SheetTop({
  title,
  onClose,
  onBack,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <TopBar
      title={title}
      onBack={onBack}
      trailing={<IconButton icon={XIcon} label={`Close ${title}`} size={32} onPress={onClose} />}
    />
  );
}
