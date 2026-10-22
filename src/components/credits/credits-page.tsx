import { CoinsIcon } from "lucide-react";
import { InfiniteList } from "@/components/infinite-list";
import type { Session } from "@/lib/auth";
import type { CreditTransaction } from "@/lib/credits";
import { formatDate, formatNumber, getDictionary } from "@/lib/i18n";
import { useBalance, useTransactions } from "@/lib/queries";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";
import { BalanceSection, TransactionRowsSkeleton } from "./skeletons";

function TransactionRow({ transaction }: { transaction: CreditTransaction }) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const { amount, kind } = transaction;
  // Only movements tied to a summary have a title; "deleted" when it's gone.
  // A refund for a summary that failed, a bonus or an adjustment have none
  const title =
    transaction.summary_title ??
    (transaction.summary_id ? dict.credits.deletedSummary : null);

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-medium tracking-tight">
          {dict.credits.kinds[kind] ?? kind}
        </p>
        {title && (
          <p
            className={cn(
              "truncate text-sm text-muted-foreground",
              !transaction.summary_title && "italic",
            )}
          >
            {title}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          <time dateTime={transaction.created_at}>
            {formatDate(locale, transaction.created_at)}
          </time>
        </p>
      </div>
      <div className="text-right tabular-nums">
        <p className={cn("font-medium", amount < 0 && "text-muted-foreground")}>
          {amount > 0 ? "+" : "−"}
          {formatNumber(locale, Math.abs(amount))}
        </p>
        <p className="text-xs text-muted-foreground">
          {dict.credits.balanceAfter(
            formatNumber(locale, transaction.balance_after),
          )}
        </p>
      </div>
    </div>
  );
}

/** Balance and the statement (every bonus, purchase, charge and refund) */
export function CreditsPage({
  session,
  onBuy,
}: {
  session: Session;
  onBuy: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const balance = useBalance(session);
  const transactions = useTransactions(session);
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="sr-only">{dict.nav.credits}</h1>
      <BalanceSection balance={balance.data} onBuy={onBuy} />

      <h2 className="mb-1 font-medium tracking-tight">
        {dict.credits.statement}
      </h2>
      <InfiniteList
        query={transactions}
        getKey={(transaction) => transaction.id}
        // py-2.5 + kind (20) + date (2 + 16), plus a summary title (20) if any
        estimateSize={(transaction) =>
          transaction.summary_title || transaction.summary_id ? 78 : 58
        }
        errorTitle={dict.credits.loadError}
        skeleton={<TransactionRowsSkeleton />}
        empty={
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <CoinsIcon className="mb-3 size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {dict.credits.emptyTitle}
            </p>
          </div>
        }
        renderItem={(transaction) => (
          <TransactionRow transaction={transaction} />
        )}
      />
    </div>
  );
}
