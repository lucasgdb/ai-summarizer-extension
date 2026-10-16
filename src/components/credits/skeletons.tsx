import { TextSkeleton } from "@/components/text-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/i18n";
import { useDictionary, useLocale } from "@/lib/use-locale";

// Small and shared: used by the credits page (lazy chunk) and by its fallback
// in the first bundle, so both look the same and nothing jumps

/** "Balance", the number (or its skeleton), "credits" and the price note */
export function BalanceSection({ balance }: { balance: number | undefined }) {
  const locale = useLocale();
  const dict = useDictionary();

  return (
    <section className="mb-8">
      <p className="text-sm text-muted-foreground">{dict.credits.balance}</p>
      <p className="mt-1 flex items-baseline gap-2 text-3xl font-semibold tracking-tighter tabular-nums">
        {balance === undefined ? (
          // In this flex line there's no 3xl text to set its height while
          // loading: 29.5px is what keeps the line at the real 36px
          <TextSkeleton className="h-[29.5px] w-20" />
        ) : (
          formatNumber(locale, balance)
        )}
        <span className="text-base font-normal tracking-normal text-muted-foreground">
          {dict.credits.title.toLowerCase()}
        </span>
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{dict.credits.about}</p>
    </section>
  );
}

/**
 * Built from the plan card's own tags and text classes, with skeletons in place
 * of the words: every line takes the real line's height, so the two match
 * exactly (and keep matching if the card changes)
 */
function PlanSkeleton({ name }: { name: string }) {
  return (
    <li
      className="flex items-center gap-3 rounded-lg border p-3.5"
      aria-hidden="true"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium tracking-tight">
          <TextSkeleton className={name} />
          {/* The line's text: a flex line only gets its height from text */}
          {"\u200b"}
        </p>
        <p className="mt-0.5 text-sm tabular-nums">
          <TextSkeleton className="w-32" />
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          <TextSkeleton className="w-36" />
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p className="font-semibold tracking-tight tabular-nums">
          <TextSkeleton className="w-16" />
        </p>
        <Skeleton className="h-7 w-20" />
      </div>
    </li>
  );
}

export function PlanCardsSkeleton() {
  return ["w-16", "w-12", "w-14", "w-10"].map((width) => (
    <PlanSkeleton key={width} name={width} />
  ));
}

/** The plans section with its fixed parts, the cards still loading */
export function PlansLoading() {
  const dict = useDictionary();

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-medium tracking-tight">{dict.plans.title}</h2>
      <ul className="space-y-2" aria-busy="true">
        <PlanCardsSkeleton />
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {dict.plans.paymentNote}
      </p>
    </section>
  );
}

/** Lines up with a statement row: kind, summary title, date | amount, balance */
function TransactionSkeleton({ title }: { title: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5" aria-hidden="true">
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className={`h-3.5 ${title}`} />
        </div>
        <div className="mt-0.5 flex h-4 items-center">
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
      <div className="flex flex-col items-end">
        <div className="flex h-6 items-center">
          <Skeleton className="h-4 w-10" />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

export function TransactionRowsSkeleton() {
  return ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-4/5"].map((title) => (
    <TransactionSkeleton key={title} title={title} />
  ));
}

/** The whole credits page before its code has arrived */
export function CreditsFallback() {
  const dict = useDictionary();

  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <BalanceSection balance={undefined} />
      {/* Matches the page: no plans in the store build (mock data) */}
      {import.meta.env.MODE !== "store" && <PlansLoading />}
      <h2 className="mb-1 font-medium tracking-tight">
        {dict.credits.statement}
      </h2>
      <TransactionRowsSkeleton />
    </div>
  );
}
