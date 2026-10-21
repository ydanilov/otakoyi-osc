import type { Scanner } from "./scanner.types";

export type { Scanner } from "./scanner.types";

/** Web pult: no in-app scanner (stub). The phone's camera app opens the pairing link instead. */
export const scanner: Scanner = {
  available: false,
  unavailableReason:
    "Scanning isn't available in the browser. Point your phone's camera at the pairing QR, or enter the address and PIN.",
  View: null,
};
