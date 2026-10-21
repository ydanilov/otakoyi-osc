import type * as React from "react";

/**
 * In-app QR scanner behind an interface (AGENTS rule 5). Native: the camera (expo-camera);
 * web: not available — the system camera app opens the same deep link, and "Enter address and
 * PIN" is the fallback.
 */
export interface Scanner {
  readonly available: boolean;
  /** Why it is not available, for the screen. */
  readonly unavailableReason?: string;
  /** Full-screen camera view that calls `onScan` with each QR code's text. */
  readonly View: React.ComponentType<{ onScan: (data: string) => void; paused?: boolean }> | null;
}
