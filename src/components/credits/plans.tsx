import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCredits,
  formatNumber,
  getDictionary,
  type Locale,
  localeConfig,
} from "@/lib/i18n";
import type { CreditPlan } from "@/lib/plans";
import { usePlans } from "@/lib/queries";
import { useDictionary, useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";
import { PlanCardsSkeleton } from "./skeletons";

function formatPrice(locale: Locale, minor: number, currency: string) {
  return new Intl.NumberFormat(localeConfig[locale].intl, {
    style: "currency",
    currency,
  }).format(minor / 100);
}

function PlanCard({ plan }: { plan: CreditPlan }) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const total = plan.credits + plan.bonus_credits;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3.5",
        plan.featured && "border-primary/60 ring-1 ring-primary/60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium tracking-tight">
          {plan.name}
          {plan.featured && (
            <Badge className="h-4 px-1.5 text-[0.625rem]">
              {dict.plans.featured}
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-sm tabular-nums">
          {formatCredits(locale, plan.credits)}
          {plan.bonus_credits > 0 && (
            <span className="ml-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {dict.plans.bonus(formatNumber(locale, plan.bonus_credits))}
            </span>
          )}
        </p>
        {/* What makes packs comparable: the bonus lowers it */}
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {dict.plans.perHundred(
            formatPrice(locale, (plan.price / total) * 100, plan.currency),
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p className="font-semibold tracking-tight tabular-nums">
          {formatPrice(locale, plan.price, plan.currency)}
        </p>
        {/* No payments yet */}
        <Button
          size="sm"
          variant={plan.featured ? "default" : "outline"}
          disabled
        >
          {dict.plans.soon}
        </Button>
      </div>
    </li>
  );
}

export function Plans() {
  const dict = useDictionary();
  const plans = usePlans();

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-medium tracking-tight">{dict.plans.title}</h2>
      {plans.isError ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {dict.plans.loadError}
        </p>
      ) : (
        <ul className="space-y-2" aria-busy={plans.isPending}>
          {plans.data ? (
            plans.data.map((plan) => <PlanCard key={plan.id} plan={plan} />)
          ) : (
            <PlanCardsSkeleton />
          )}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {dict.plans.paymentNote}
      </p>
    </section>
  );
}
