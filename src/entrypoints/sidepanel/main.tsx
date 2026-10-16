import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "#imports";
import { queryClient } from "@/lib/queries";
import { loadLocale } from "@/lib/use-locale";
import { loadPreferences } from "@/lib/use-preferences";
import { loadSession } from "@/lib/use-session";
import { App } from "./app";
import "@/styles/globals.css";

document.title = browser.i18n.getMessage("extName");

await Promise.all([loadLocale(), loadSession(), loadPreferences()]);

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Only the animation features we use (m.* components), not all of
          motion, fetched after first paint; and they follow the OS "reduce
          motion" setting */}
      <LazyMotion
        features={() => import("@/lib/motion-features").then((m) => m.default)}
        strict
      >
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  </StrictMode>,
);
