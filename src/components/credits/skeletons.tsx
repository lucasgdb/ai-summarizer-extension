import { CoinsIcon } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/i18n";
import { useDictionary, useLocale } from "@/lib/use-locale";

// Small and shared: used by the credits page (lazy chunk) and by its fallback
// in the first bundle, so both look the same and nothing jumps

/**
 * "Balance", the number (or its skeleton), "credits", the price note and "Buy
 * credits" (disabled in the fallback, so it's there from the start)
 */
export function BalanceSection({
  balance,
  onBuy,
}: {
  balance: number | undefined;
  onBuy?: () => void;
}) {
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
      <Button size="sm" className="mt-4" disabled={!onBuy} onClick={onBuy}>
        <CoinsIcon data-icon="inline-start" />
        {dict.buy.open}
      </Button>
    </section>
  );
}

/**
 * Built from the pack card's own tags and text classes, with skeletons in
 * place of what comes from the API: every line takes the real line's height,
 * so the two match exactly. The button's label is fixed, so it's real
 */
function PackSkeleton({ credits }: { credits: string }) {
  const dict = useDictionary();

  return (
    <li
      className="flex items-center gap-3 rounded-lg border p-3.5"
      aria-hidden="true"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium tracking-tight">
          <TextSkeleton className={credits} />
          {/* The line's text: a flex line only gets its height from text */}
          {"\u200b"}
        </p>
        <p className="mt-0.5 text-sm tabular-nums">
          <TextSkeleton className="w-36" />
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          <TextSkeleton className="w-36" />
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p className="font-semibold tracking-tight tabular-nums">
          <TextSkeleton className="w-16" />
        </p>
        <Button size="sm" variant="outline" disabled tabIndex={-1}>
          {dict.buy.buy}
        </Button>
      </div>
    </li>
  );
}

export function PackCardsSkeleton() {
  return ["w-24", "w-28", "w-28", "w-32"].map((width, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
    <PackSkeleton key={index} credits={width} />
  ));
}

/** "← Back", the title and the intro: fixed, shared with the fallback */
export function BuyHeader({ onBack }: { onBack?: () => void }) {
  const dict = useDictionary();

  return (
    <div className="mb-6">
      <BackButton onClick={onBack ?? (() => {})}>{dict.back}</BackButton>
      <h1 className="mt-4 text-2xl font-semibold tracking-tighter">
        {dict.buy.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{dict.buy.intro}</p>
    </div>
  );
}

/** The purchase screen before its code has arrived */
export function BuyCreditsFallback({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <BuyHeader onBack={onBack} />
      <ul className="space-y-2">
        <PackCardsSkeleton />
      </ul>
    </div>
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
      <h2 className="mb-1 font-medium tracking-tight">
        {dict.credits.statement}
      </h2>
      <TransactionRowsSkeleton />
    </div>
  );
}
