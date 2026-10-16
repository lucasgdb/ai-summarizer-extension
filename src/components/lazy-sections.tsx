import { lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export { CreditsFallback } from "@/components/credits/skeletons";
export { HistoryFallback } from "@/components/history/skeletons";

// Shown after an action, not when the panel opens: split off the first bundle
// (and fetched once the browser is idle, so usually already there)
const loadHistory = () => import("@/components/history/history");
const loadCredits = () => import("@/components/credits/credits-page");
const loadForm = () => import("@/components/summarize-form");

export const History = lazy(() =>
  loadHistory().then((module) => ({ default: module.History })),
);
export const CreditsPage = lazy(() =>
  loadCredits().then((module) => ({ default: module.CreditsPage })),
);
export const SummarizeForm = lazy(() =>
  loadForm().then((module) => ({ default: module.SummarizeForm })),
);

export function preloadSections() {
  const load = () => {
    loadForm();
    loadHistory();
    loadCredits();
  };
  if ("requestIdleCallback" in window) requestIdleCallback(load);
  else setTimeout(load, 1);
}

/** The options bar and the Summarize button, before the form's code arrives */
export function FormFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  );
}
