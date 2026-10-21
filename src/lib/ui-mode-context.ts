import { createContext, use } from "react";
import type { UiMode } from "./ui-mode";

export const UiModeContext = createContext<UiMode>("sidepanel");

export function useUiMode() {
  return use(UiModeContext);
}
