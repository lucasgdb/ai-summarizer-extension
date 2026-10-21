import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "#imports";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadFillPreferences } from "@/lib/fill-preferences";
import { queryClient } from "@/lib/queries";
import type { UiMode } from "@/lib/ui-mode";
import { UiModeContext } from "@/lib/ui-mode-context";
import { loadLocale } from "@/lib/use-locale";
import { loadPreferences } from "@/lib/use-preferences";
import { loadSession } from "@/lib/use-session";
import { App } from "./app";
import "@/styles/globals.css";

/** The same app in the side panel and in the toolbar popup */
export async function render(mode: UiMode) {
  document.title = browser.i18n.getMessage("extName");
  document.documentElement.dataset.mode = mode;

  await Promise.all([
    loadLocale(),
    loadSession(),
    loadPreferences(),
    loadFillPreferences(),
  ]);

  const root = document.getElementById("root");
  if (!root) throw new Error("#root is missing");

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* Only the animation features we use (m.* components), not all of
          motion, fetched after first paint; and they follow the OS "reduce
          motion" setting */}
        <LazyMotion
          features={() =>
            import("@/lib/motion-features").then((m) => m.default)
          }
          strict
        >
          <MotionConfig reducedMotion="user">
            {/* Tooltips open after a short pause, all with the same delay */}
            <TooltipProvider delayDuration={300}>
              <UiModeContext value={mode}>
                <App />
              </UiModeContext>
            </TooltipProvider>
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </StrictMode>,
  );
}
