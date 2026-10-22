import { lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export {
  BuyCreditsFallback,
  CreditsFallback,
} from "@/components/credits/skeletons";
export { HistoryFallback } from "@/components/history/skeletons";

// Shown after an action, not when the panel opens: split off the first bundle
// (and fetched once the browser is idle, so usually already there)
const loadHistory = () => import("@/components/history/history");
const loadCredits = () => import("@/components/credits/credits-page");
const loadBuy = () => import("@/components/credits/buy-credits");
const loadForm = () => import("@/components/summarize-form");

export const History = lazy(() =>
  loadHistory().then((module) => ({ default: module.History })),
);
export const CreditsPage = lazy(() =>
  loadCredits().then((module) => ({ default: module.CreditsPage })),
);
export const BuyCredits = lazy(() =>
  loadBuy().then((module) => ({ default: module.BuyCredits })),
);
export const SummarizeForm = lazy(() =>
  loadForm().then((module) => ({ default: module.SummarizeForm })),
);

export function preloadSections() {
  const load = () => {
    loadForm();
    loadHistory();
    loadCredits();
    loadBuy();
  };
  if ("requestIdleCallback" in window) requestIdleCallback(load);
  else setTimeout(load, 1);
}

/**
 * The options bar, the Summarize button (and "Select again" for a picked
 * element) and the balance under them, before the form's code arrives. The
 * form's own layout: gap-5, then the buttons and the balance 12px apart
 */
export function FormFallback({ reselect = false }: { reselect?: boolean }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      {/* The options toggle: 40px, plus its 1px border above and below */}
      <Skeleton className="h-[2.625rem] w-full rounded-lg" />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-43" />
          {reselect && <Skeleton className="h-8 w-28" />}
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-29" />
        </div>
      </div>
    </div>
  );
}
