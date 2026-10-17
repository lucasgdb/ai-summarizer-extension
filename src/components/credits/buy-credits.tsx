import {
  CheckIcon,
  CircleCheckIcon,
  CopyIcon,
  TimerOffIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiUnreachableError } from "@/lib/api";
import type { Session } from "@/lib/auth";
import type { CreditPack, Purchase } from "@/lib/credits";
import {
  type Dictionary,
  formatCredits,
  formatNumber,
  getDictionary,
  type Locale,
  localeConfig,
} from "@/lib/i18n";
import {
  useCreatePurchase,
  usePacks,
  usePurchase,
  useSimulatePurchase,
} from "@/lib/queries";
import { ApiError } from "@/lib/requests";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";
import { BuyHeader, PackCardsSkeleton } from "./skeletons";

function formatPrice(locale: Locale, cents: number, currency: string) {
  return new Intl.NumberFormat(localeConfig[locale].intl, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatPercent(locale: Locale, share: number) {
  return new Intl.NumberFormat(localeConfig[locale].intl, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);
}

/** 401 isn't here: the session is already dropped (back to sign-in) */
function purchaseError(dict: Dictionary, error: unknown) {
  if (error instanceof ApiUnreachableError) {
    return dict.summaryErrors.offline.title;
  }
  if (error instanceof ApiError) {
    if (error.status === 400) return dict.buy.packChanged;
    if (error.status === 502) return dict.buy.providerDown;
    if (error.status === 503) return dict.buy.notConfigured;
  }
  return dict.buy.failedToStart;
}

/**
 * Packs from the API, then the PIX for the chosen one, followed until it's
 * paid, expires or fails. Leaving the screen stops following it; a payment
 * made meanwhile still counts (the API confirms it on its own)
 */
export function BuyCredits({
  session,
  onBack,
}: {
  session: Session;
  /** Back to where "Buy credits" was opened */
  onBack: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const packs = usePacks();
  const create = useCreatePurchase(session);
  const [chosen, setChosen] = useState<CreditPack | null>(null);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);

  function buy(pack: CreditPack) {
    setChosen(pack);
    create.mutate(pack.id, {
      onSuccess: (purchase) => setPurchaseId(purchase.id),
    });
  }

  function showPacks() {
    setPurchaseId(null);
    create.reset();
    window.scrollTo(0, 0);
  }

  if (purchaseId && chosen) {
    return (
      <div className="flex flex-1 flex-col">
        <BuyHeader onBack={showPacks} />
        <PurchaseView
          session={session}
          id={purchaseId}
          currency={chosen.currency}
          renewing={create.isPending}
          renewError={create.isError ? purchaseError(dict, create.error) : null}
          onRenew={() => buy(chosen)}
          onOtherPack={showPacks}
          onDone={onBack}
        />
      </div>
    );
  }

  const enabled = packs.data?.purchases_enabled ?? true;
  const recommended = packs.data ? recommendedPack(packs.data.packs) : null;

  return (
    <div className="flex flex-1 flex-col">
      <BuyHeader onBack={onBack} />
      {packs.isError ? (
        <Notice
          icon={TriangleAlertIcon}
          title={dict.buy.loadError}
          actions={
            <Button variant="outline" size="sm" onClick={() => packs.refetch()}>
              {dict.tryAgain}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {!enabled && (
            <p role="status" className="text-sm text-muted-foreground">
              {dict.buy.unavailable}
            </p>
          )}
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {purchaseError(dict, create.error)}
            </p>
          )}
          <ul className="space-y-2" aria-busy={packs.isPending}>
            {packs.data ? (
              packs.data.packs.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  recommended={pack.id === recommended}
                  disabled={!enabled || create.isPending}
                  pending={create.isPending && chosen?.id === pack.id}
                  onBuy={() => buy(pack)}
                />
              ))
            ) : (
              <PackCardsSkeleton />
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function PackCard({
  pack,
  recommended,
  disabled,
  pending,
  onBuy,
}: {
  pack: CreditPack;
  recommended: boolean;
  disabled: boolean;
  pending: boolean;
  onBuy: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3.5",
        recommended && "border-primary/60 ring-1 ring-primary/60",
      )}
    >
      <div className="min-w-0 flex-1">
        {/* What the user gets, bonus included */}
        <p className="flex items-center gap-2 font-medium tracking-tight tabular-nums">
          {formatCredits(locale, pack.total_credits)}
          {recommended && (
            <Badge className="h-4 px-1.5 text-[0.625rem]">
              {dict.buy.recommended}
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-sm tabular-nums">
          {pack.bonus_credits > 0 ? (
            <>
              {formatNumber(locale, pack.credits)}
              <span className="ml-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {dict.buy.bonus(
                  formatNumber(locale, pack.bonus_credits),
                  formatPercent(locale, pack.bonus_credits / pack.credits),
                )}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{dict.buy.noBonus}</span>
          )}
        </p>
        {/* What makes packs comparable: the bonus lowers it */}
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {dict.buy.perHundred(
            formatPrice(
              locale,
              (pack.price_cents / pack.total_credits) * 100,
              pack.currency,
            ),
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p className="font-semibold tracking-tight tabular-nums">
          {formatPrice(locale, pack.price_cents, pack.currency)}
        </p>
        <Button
          size="sm"
          variant={recommended ? "default" : "outline"}
          disabled={disabled}
          onClick={onBuy}
        >
          {pending && <Spinner data-icon="inline-start" />}
          {dict.buy.buy}
        </Button>
      </div>
    </li>
  );
}

/**
 * The pack to highlight, from the API's numbers alone: the smallest one at
 * the best price per credit. None when no pack has a bonus (all the same)
 */
function recommendedPack(packs: CreditPack[]) {
  if (!packs.some((pack) => pack.bonus_credits > 0)) return null;
  const rate = (pack: CreditPack) => pack.price_cents / pack.total_credits;
  const best = Math.min(...packs.map(rate));
  return (
    packs
      .filter((pack) => rate(pack) <= best * (1 + 1e-9))
      .sort((a, b) => a.price_cents - b.price_cents)[0]?.id ?? null
  );
}

/** Now, every second: drives the countdown and the expiry by the clock */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** "29:41", or "1:02:03" past an hour */
function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

function PurchaseView({
  session,
  id,
  currency,
  renewing,
  renewError,
  onRenew,
  onOtherPack,
  onDone,
}: {
  session: Session;
  id: string;
  currency: string;
  /** A new PIX for the same pack is being created */
  renewing: boolean;
  renewError: string | null;
  onRenew: () => void;
  onOtherPack: () => void;
  onDone: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const now = useNow();
  const query = usePurchase(session, id);
  const simulate = useSimulatePurchase(session);
  const purchase = query.data;
  if (!purchase) return null;

  // Past its time it can't be paid anymore, whatever the last poll said
  const status =
    purchase.status === "pending" && now >= Date.parse(purchase.expires_at)
      ? "expired"
      : purchase.status;
  const amount = formatPrice(locale, purchase.amount_cents, currency);

  if (status === "paid") {
    return (
      <div
        className="flex flex-col items-center py-6 text-center"
        role="status"
      >
        <CircleCheckIcon className="mb-3 size-8 text-emerald-600 dark:text-emerald-400" />
        <p className="font-medium tracking-tight">{dict.buy.paidTitle}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tighter tabular-nums">
          {dict.buy.paidCredits(formatCredits(locale, purchase.total_credits))}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {dict.buy.newBalance(formatCredits(locale, purchase.credit_balance))}
        </p>
        <Button className="mt-6" onClick={onDone}>
          {dict.buy.done}
        </Button>
      </div>
    );
  }

  const otherPack = (
    <Button variant="ghost" size="sm" onClick={onOtherPack}>
      {dict.buy.otherPack}
    </Button>
  );

  if (status !== "pending") {
    const expired = status === "expired";
    return (
      <div className="space-y-3">
        <PurchaseSummary purchase={purchase} amount={amount} />
        <Notice
          icon={expired ? TimerOffIcon : TriangleAlertIcon}
          variant={expired ? "default" : "destructive"}
          title={expired ? dict.buy.expiredTitle : dict.buy.failedTitle}
          actions={
            <>
              <Button size="sm" disabled={renewing} onClick={onRenew}>
                {renewing && <Spinner data-icon="inline-start" />}
                {expired ? dict.buy.newPix : dict.tryAgain}
              </Button>
              {otherPack}
            </>
          }
        >
          {expired ? dict.buy.expiredBody : dict.buy.failedBody}
        </Notice>
        {renewError && (
          <p role="alert" className="text-sm text-destructive">
            {renewError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PurchaseSummary purchase={purchase} amount={amount} />
      {/* White behind the code in both themes: banking apps read it best */}
      <div className="flex justify-center rounded-lg border bg-white p-4">
        <img
          src={purchase.br_code_base64}
          alt={dict.buy.qrAlt(amount)}
          width={208}
          height={208}
          className="size-52"
        />
      </div>
      <p
        className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Spinner />
        {dict.buy.waiting}
        <span className="tabular-nums">
          {dict.buy.expiresIn(
            formatRemaining(Date.parse(purchase.expires_at) - now),
          )}
        </span>
      </p>
      <CopyCodeButton code={purchase.br_code} />
      <p className="text-sm text-muted-foreground">{dict.buy.steps}</p>
      {purchase.dev_mode && (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            disabled={simulate.isPending}
            onClick={() => simulate.mutate(purchase.id)}
          >
            {simulate.isPending && <Spinner data-icon="inline-start" />}
            {dict.buy.simulate}
          </Button>
          {simulate.isError && (
            <p role="alert" className="text-sm text-destructive">
              {dict.buy.simulateError}
            </p>
          )}
        </div>
      )}
      <div className="flex justify-center">{otherPack}</div>
    </div>
  );
}

/** "1,100 credits", "1,000 + 100 bonus · R$ 10.00", and "Sandbox" for a test charge */
function PurchaseSummary({
  purchase,
  amount,
}: {
  purchase: Purchase;
  amount: string;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xl font-semibold tracking-tight tabular-nums">
          {formatCredits(locale, purchase.total_credits)}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {purchase.bonus_credits > 0 &&
            `${dict.buy.bonusBreakdown(
              formatNumber(locale, purchase.credits),
              formatNumber(locale, purchase.bonus_credits),
            )} · `}
          {amount}
        </p>
      </div>
      {purchase.dev_mode && (
        <Badge variant="secondary">{dict.buy.sandbox}</Badge>
      )}
    </div>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button className="w-full" onClick={copy}>
      {copied ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
      {copied ? dict.buy.copied : dict.buy.copyCode}
    </Button>
  );
}
