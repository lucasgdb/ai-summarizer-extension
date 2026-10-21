import {
  ChevronDownIcon,
  CoinsIcon,
  SlidersHorizontalIcon,
  WandSparklesIcon,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useId, useRef, useState } from "react";
import { Notice } from "@/components/notice";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Session } from "@/lib/auth";
import { useBuyCredits } from "@/lib/buy-credits";
import {
  updateFillPreferences,
  useFillPreferences,
} from "@/lib/fill-preferences";
import type { FillChoices, FormOptions } from "@/lib/forms";
import {
  formatCredits,
  formatNumber,
  getDictionary,
  languageLabel,
} from "@/lib/i18n";
import type { ScannedForm } from "@/lib/messages";
import { useBalance, useFillQuote, useFormOptions } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";

/** A saved choice the API still offers, else its default */
function pick(value: string | undefined, allowed: string[], fallback: string) {
  return value && allowed.includes(value) ? value : fallback;
}

function resolveChoices(
  saved: FillChoices,
  options: FormOptions | undefined,
): FillChoices {
  // No model: the API fills forms with its cheapest one
  if (!options) {
    return {
      effort: saved.effort,
      tone: saved.tone,
      answer_length: saved.answer_length,
      language: saved.language,
      only_empty: saved.only_empty,
    };
  }
  const { defaults } = options;
  return {
    effort: pick(saved.effort, options.efforts, defaults.effort),
    tone: pick(saved.tone, options.tones, defaults.tone),
    answer_length: pick(
      saved.answer_length,
      options.answer_lengths,
      defaults.answer_length,
    ),
    language: pick(
      saved.language,
      ["auto", ...options.languages],
      defaults.language,
    ),
    only_empty: saved.only_empty,
  };
}

function ChoiceSelect({
  id,
  label,
  value,
  choices,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string | undefined;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * The context (what matters most: the answers come from it), how they're
 * written, and "Fill · 4 credits"
 */
export function FillForm({
  session,
  form,
  initialContext = "",
  notice,
  onFill,
}: {
  session: Session;
  form: ScannedForm;
  /** What was typed before (a failed fill, an undo): ready to change and resend */
  initialContext?: string;
  /** Why the last try didn't go through (price changed, not enough credits…) */
  notice?: string;
  onFill: (context: string, choices: FillChoices, price: number) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const id = useId();
  const options = useFormOptions();
  const saved = useFillPreferences();
  const choices = resolveChoices(saved, options.data);
  const [context, setContext] = useState(initialContext);
  const maxContext = options.data?.max_context_length ?? 2000;
  const buyCredits = useBuyCredits();

  const toSend = choices.only_empty
    ? form.fields.filter((field) => !field.filled)
    : form.fields;
  const debouncedContext = useDebouncedValue(context.trim(), 500);
  const ready = debouncedContext !== "" && toSend.length > 0;
  const quote = useFillQuote(
    session,
    form,
    debouncedContext,
    choices,
    ready && !options.isPending,
  );
  const balance = useBalance(session).data ?? quote.data?.balance;
  // A price for what's typed now, not a moment ago
  const stale = debouncedContext !== context.trim() || quote.isPlaceholderData;
  const price = ready ? quote.data?.credits : undefined;
  const insufficient =
    price !== undefined &&
    !stale &&
    ((balance !== undefined && balance < price) ||
      quote.data?.sufficient === false);
  const hasContext = context.trim() !== "";
  // Without a context the button stays clickable: pressing it says what's
  // missing, right at the field, instead of a silent disabled button
  const canFill = price !== undefined && !stale && !insufficient && hasContext;
  const [contextMissing, setContextMissing] = useState(false);
  const contextRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);

  const languages = options.data?.languages ?? [];
  const optionsLoading = options.isPending;
  // The closed panel's line: what the answers will be like
  const summary = [
    choices.tone && (dict.fill.tones[choices.tone] ?? choices.tone),
    choices.answer_length &&
      (dict.fill.answerLengths[choices.answer_length] ?? choices.answer_length),
    choices.language === "auto" || !choices.language
      ? dict.fill.languageAuto
      : languageLabel(locale, choices.language),
    choices.effort && (dict.options.efforts[choices.effort] ?? choices.effort),
    choices.only_empty && dict.fill.onlyEmpty,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      className="space-y-5"
      // Our message at the field, not the browser's tooltip
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasContext) {
          setContextMissing(true);
          contextRef.current?.focus();
          return;
        }
        if (canFill && price !== undefined) {
          onFill(context.trim(), choices, price);
        }
      }}
    >
      <Field data-invalid={contextMissing || undefined}>
        <FieldLabel htmlFor={`${id}-context`}>
          {dict.fill.context}
          {/* Next to the word: the label's flex gap would push it away */}
          <span aria-hidden="true" className="-ml-1.5 text-destructive">
            *
          </span>
        </FieldLabel>
        <Textarea
          ref={contextRef}
          id={`${id}-context`}
          value={context}
          maxLength={maxContext}
          rows={5}
          required
          aria-invalid={contextMissing || undefined}
          aria-describedby={contextMissing ? `${id}-context-error` : undefined}
          placeholder={dict.fill.contextPlaceholder}
          onChange={(event) => {
            setContext(event.target.value);
            if (event.target.value.trim()) setContextMissing(false);
          }}
        />
        {contextMissing && (
          <FieldError id={`${id}-context-error`}>
            {dict.fill.contextRequired}
          </FieldError>
        )}
        <FieldDescription className="flex justify-between gap-3">
          <span>{dict.fill.contextHint}</span>
          <span className="shrink-0 tabular-nums">
            {formatNumber(locale, context.length)}/
            {formatNumber(locale, maxContext)}
          </span>
        </FieldDescription>
      </Field>

      {/* How the answers are written: tucked away, like the summarize form's
          Options. What matters is the context above */}
      <div className="rounded-lg border">
        <button
          type="button"
          disabled={optionsLoading}
          aria-expanded={open}
          aria-controls={`${id}-options`}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:hover:bg-transparent",
            open ? "rounded-t-lg" : "rounded-lg",
          )}
        >
          <SlidersHorizontalIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{dict.options.title}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {optionsLoading ? <TextSkeleton className="w-4/5" /> : summary}
          </span>
          <ChevronDownIcon
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <m.div
              key="options"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div id={`${id}-options`} className="space-y-4 border-t p-4">
                <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                  <ChoiceSelect
                    id={`${id}-tone`}
                    label={dict.fill.tone}
                    value={choices.tone}
                    disabled={optionsLoading}
                    choices={(options.data?.tones ?? []).map((tone) => ({
                      value: tone,
                      label: dict.fill.tones[tone] ?? tone,
                    }))}
                    onChange={(tone) => updateFillPreferences({ tone })}
                  />
                  <ChoiceSelect
                    id={`${id}-length`}
                    label={dict.fill.answerLength}
                    value={choices.answer_length}
                    disabled={optionsLoading}
                    choices={(options.data?.answer_lengths ?? []).map(
                      (length) => ({
                        value: length,
                        label: dict.fill.answerLengths[length] ?? length,
                      }),
                    )}
                    onChange={(answer_length) =>
                      updateFillPreferences({ answer_length })
                    }
                  />
                  <ChoiceSelect
                    id={`${id}-language`}
                    label={dict.fill.language}
                    value={choices.language}
                    disabled={optionsLoading}
                    choices={[
                      { value: "auto", label: dict.fill.languageAuto },
                      ...languages.map((language) => ({
                        value: language,
                        label: languageLabel(locale, language),
                      })),
                    ]}
                    onChange={(language) => updateFillPreferences({ language })}
                  />
                  <ChoiceSelect
                    id={`${id}-effort`}
                    label={dict.options.effort}
                    value={choices.effort}
                    disabled={optionsLoading}
                    choices={(options.data?.efforts ?? []).map((effort) => ({
                      value: effort,
                      label: dict.options.effortChoices[effort] ?? effort,
                    }))}
                    onChange={(effort) => updateFillPreferences({ effort })}
                  />
                </div>

                <Field orientation="horizontal">
                  <Switch
                    id={`${id}-only-empty`}
                    checked={choices.only_empty}
                    onCheckedChange={(only_empty) =>
                      updateFillPreferences({ only_empty })
                    }
                  />
                  <div className="grid gap-0.5">
                    <FieldLabel htmlFor={`${id}-only-empty`}>
                      {dict.fill.onlyEmpty}
                    </FieldLabel>
                    <FieldDescription>
                      {dict.fill.onlyEmptyHint}
                    </FieldDescription>
                  </div>
                </Field>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {toSend.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {dict.fill.nothingToFill}
        </p>
      )}
      {notice && !insufficient && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {insufficient && price !== undefined && balance !== undefined && (
        <Notice
          icon={CoinsIcon}
          title={dict.credits.insufficientTitle}
          actions={
            buyCredits && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={buyCredits}
              >
                {dict.buy.open}
              </Button>
            )
          }
        >
          {balance < 0
            ? dict.credits.negativeBody
            : dict.fill.insufficient(
                formatCredits(locale, price),
                formatCredits(locale, balance),
              )}
        </Notice>
      )}

      <div className="space-y-3">
        <Button
          type="submit"
          // Clickable without a context (it points at the field); otherwise
          // only once there's a price that fits the balance
          disabled={toSend.length === 0 || (hasContext && !canFill)}
        >
          {quote.isFetching && ready ? (
            <Spinner data-icon="inline-start" aria-label={dict.loading} />
          ) : (
            <WandSparklesIcon data-icon="inline-start" />
          )}
          {dict.fill.fill}
          {ready && (
            <span className="font-normal opacity-70">
              ·{" "}
              {price === undefined || stale ? (
                <>
                  <TextSkeleton className="w-3 bg-current opacity-30" />{" "}
                  {dict.credits.unit}
                </>
              ) : (
                formatCredits(locale, price)
              )}
            </span>
          )}
        </Button>
        <p className="text-xs text-muted-foreground tabular-nums">
          {dict.credits.balance}:{" "}
          {balance === undefined ? (
            <TextSkeleton className="w-16" />
          ) : (
            formatCredits(locale, balance)
          )}
        </p>
      </div>
    </form>
  );
}
