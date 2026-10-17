import { createContext, useContext } from "react";

/**
 * Opens the "Buy credits" screen from wherever credits run short (the
 * summarize form, a translation); null outside the signed-in panel
 */
export const BuyCreditsContext = createContext<(() => void) | null>(null);

export function useBuyCredits() {
  return useContext(BuyCreditsContext);
}
