import { useForm, useStore } from "@tanstack/react-form";
import {
  ChevronDownIcon,
  CoinsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useId, useState } from "react";
import { BlockedReason } from "@/components/blocked-reason";
import { Notice } from "@/components/notice";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
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
import { Textarea } from "@/components/ui/textarea";
import { useAudioGenerating } from "@/lib/audio-busy";
import type { Session } from "@/lib/auth";
import { useBuyCredits } from "@/lib/buy-credits";
import { insufficientMessage } from "@/lib/credits-messages";
import { type GenerationForm, generationSchema } from "@/lib/generation-schema";
import { formatCredits, getDictionary, languageLabel } from "@/lib/i18n";
import type { PickedContent } from "@/lib/messages";
import { resolveGeneration } from "@/lib/preferences";
import { useBalance, useOptions, useQuote } from "@/lib/queries";
import {
  type Generation,
  type SummaryOptions,
  uiLanguage,
} from "@/lib/summaries";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useLocale } from "@/lib/use-locale";
import { updatePreferences, usePreferences } from "@/lib/use-preferences";
import { cn } from "@/lib/utils";

type Props = {
  session: Session;
  content: PickedContent;
  /** The API answered 409: the button now shows the new price */
  priceChanged: boolean;
  /** Called with exactly the options and price that were quoted */
  onSummarize: (expectedCredits: number, generation: Generation) => void;
  /** Picks another element; absent for the whole page (it would read the same) */
  onReselect?: () => void;
};

/**
 * The options and the "Summarize · 2 credits" button. Mounted once the
 * options are known, so the form starts from valid values.
 */
export function SummarizeForm(props: Props) {
  const options = useOptions();
  // Down or slow: summarize with the API's defaults, without the options panel
  if (options.isPending) {
    return <PricedForm {...props} options={undefined} optionsPending />;
  }
  return (
    <PricedForm
      key={options.data ? "options" : "defaults"}
      {...props}
      options={options.data}
    />
  );
}

function PricedForm({
  session,
  content,
  priceChanged,
  onSummarize,
  onReselect,
  options,
  optionsPending = false,
}: Props & {
  options: SummaryOptions | undefined;
  /** The panel shows as a disabled skeleton, so the layout doesn't jump */
  optionsPending?: boolean;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const id = useId();
  const [open, setOpen] = useState(false);
  const buyCredits = useBuyCredits();
  // One paid action at a time: not while an audio is being generated
  const generating = useAudioGenerating();

  const saved = resolveGeneration(usePreferences(), options, locale);
  const form = useForm({
    defaultValues: {
      // "" = no choice: resolveGeneration turns it into the API's default
      style: saved.style ?? "",
      length: saved.length ?? "",
      effort: saved.effort ?? "",
      language: saved.language ?? "",
      instructions: saved.instructions,
    } satisfies GenerationForm,
    validators: { onChange: generationSchema(options, dict) },
    // Remember the choices for next time (only ones the API would accept)
    listeners: {
      onChangeDebounceMs: 300,
      onChange: ({ formApi }) => {
        if (!formApi.state.isValid) return;
        // The language is saved only when the user picks one (its field's own
        // listener): until then it keeps following the UI language
        const { language: _, ...choices } = formApi.state.values;
        updatePreferences(choices);
      },
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const valid = useStore(form.store, (state) => state.isValid);
  // Typing preferences re-quotes once the user pauses, not on every key
  const instructions = useDebouncedValue(values.instructions, 500);
  const generation = resolveGeneration(
    { ...values, instructions },
    options,
    locale,
  );

  const quote = useQuote(session, content, locale, generation, valid);
  const balance = useBalance(session).data ?? quote.data?.balance;
  const price = quote.data?.credits;
  // The price on screen isn't for the current choices yet
  const stale = quote.isPlaceholderData || instructions !== values.instructions;
  const insufficient =
    !stale && price !== undefined && balance !== undefined && balance < price;
  const ready = valid && price !== undefined && !stale && !insufficient;
  // A price is on its way (not failed, not skipped for an invalid form)
  const pricing = price === undefined && valid && !quote.isError;

  const styleLabel = (style: string) =>
    dict.options.styles[style]?.label ?? style;
  const lengthLabel = (length: string) =>
    dict.options.lengths[length] ?? length;
  const effortLabel = (effort: string) =>
    dict.options.efforts[effort] ?? effort;
  const summary = [
    generation.style && styleLabel(generation.style),
    generation.length && lengthLabel(generation.length),
    generation.effort && effortLabel(generation.effort),
    // Only worth a mention when it isn't the UI's own language
    generation.language &&
      generation.language !== uiLanguage(locale) &&
      languageLabel(locale, generation.language),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        // Validates and marks every field touched, so errors show up
        await form.handleSubmit();
        if (form.state.isValid && ready && !generating) {
          onSummarize(price, generation);
        }
      }}
    >
      {(options || optionsPending) && (
        <div className="rounded-lg border">
          <button
            type="button"
            disabled={!options}
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
              {options ? summary : <TextSkeleton className="w-4/5" />}
            </span>
            <ChevronDownIcon
              className={cn(
                "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>

          {/* Height from 0 to the content's own, so the fields below the
              toggle slide open instead of popping in */}
          <AnimatePresence initial={false}>
            {open && options && (
              <m.div
                key="options"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                // Clips the fields while it grows (the selects' lists are
                // portaled, so they're never cut)
                className="overflow-hidden"
              >
                <FieldGroup id={`${id}-options`} className="border-t p-4">
                  <form.Field name="style">
                    {(field) => (
                      <ChoiceField
                        id={`${id}-style`}
                        label={dict.options.style}
                        value={field.state.value}
                        onChange={field.handleChange}
                        errors={field.state.meta.errors}
                        selected={styleLabel(field.state.value)}
                        description={
                          dict.options.styles[field.state.value]?.hint
                        }
                        choices={options.styles.map((style) => ({
                          value: style,
                          label: styleLabel(style),
                          hint: dict.options.styles[style]?.hint,
                        }))}
                      />
                    )}
                  </form.Field>

                  <form.Field
                    name="language"
                    listeners={{
                      onChange: ({ value }) =>
                        updatePreferences({ language: value }),
                    }}
                  >
                    {(field) => (
                      <ChoiceField
                        id={`${id}-language`}
                        label={dict.options.language}
                        value={field.state.value}
                        onChange={field.handleChange}
                        errors={field.state.meta.errors}
                        selected={languageLabel(locale, field.state.value)}
                        choices={options.languages.map((language) => ({
                          value: language,
                          label: languageLabel(locale, language),
                        }))}
                      />
                    )}
                  </form.Field>

                  <div className="grid grid-cols-2 items-start gap-4">
                    <form.Field name="length">
                      {(field) => (
                        <ChoiceField
                          id={`${id}-length`}
                          label={dict.options.length}
                          value={field.state.value}
                          onChange={field.handleChange}
                          errors={field.state.meta.errors}
                          selected={lengthLabel(field.state.value)}
                          choices={options.lengths.map((length) => ({
                            value: length,
                            label: lengthLabel(length),
                          }))}
                        />
                      )}
                    </form.Field>
                    <form.Field name="effort">
                      {(field) => (
                        <ChoiceField
                          id={`${id}-effort`}
                          label={dict.options.effort}
                          value={field.state.value}
                          onChange={field.handleChange}
                          errors={field.state.meta.errors}
                          selected={effortLabel(field.state.value)}
                          choices={options.efforts.map((effort) => ({
                            value: effort,
                            label: dict.options.effortChoices[effort] ?? effort,
                          }))}
                        />
                      )}
                    </form.Field>
                  </div>
                  {/* Full width under the pair: a half-width column would wrap it
                  into a tall block */}
                  {values.effort === "high" && (
                    <FieldDescription className="-mt-2">
                      {dict.options.effortHighHint}
                    </FieldDescription>
                  )}

                  <form.Field name="instructions">
                    {(field) => {
                      const invalid = field.state.meta.errors.length > 0;
                      return (
                        <Field data-invalid={invalid}>
                          <FieldLabel htmlFor={`${id}-instructions`}>
                            {dict.options.instructions}
                          </FieldLabel>
                          <Textarea
                            id={`${id}-instructions`}
                            name={field.name}
                            rows={3}
                            placeholder={dict.options.instructionsPlaceholder}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            aria-invalid={invalid}
                            className="resize-none"
                          />
                          <div className="flex items-start justify-between gap-3">
                            <FieldError errors={field.state.meta.errors} />
                            <span
                              className={cn(
                                "ml-auto text-xs text-muted-foreground tabular-nums",
                                invalid && "text-destructive",
                              )}
                            >
                              {field.state.value.length}/
                              {options.max_instructions_length}
                            </span>
                          </div>
                        </Field>
                      );
                    }}
                  </form.Field>
                </FieldGroup>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {quote.isError && (
        <p
          role="alert"
          className="flex items-center gap-1 text-sm text-destructive"
        >
          {dict.credits.quoteError}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-1"
            onClick={() => quote.refetch()}
          >
            {dict.tryAgain}
          </Button>
        </p>
      )}

      {/* Right above the button they explain, where the eye goes when it's
          disabled (at the top, past the options, they went unnoticed) */}
      {insufficient && (
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
          {insufficientMessage(dict, locale, price, balance)}
        </Notice>
      )}
      {priceChanged && price !== undefined && !insufficient && (
        <p role="status" className="text-sm text-muted-foreground">
          {dict.credits.priceChanged(formatCredits(locale, price))}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BlockedReason reason={generating ? dict.audio.busy : null}>
            <Button type="submit" disabled={!ready || generating}>
              {quote.isFetching && (price === undefined || stale) ? (
                <Spinner aria-label={dict.loading} />
              ) : (
                <SparklesIcon data-icon="inline-start" />
              )}
              {dict.summarize}
              {/* "Summarize" is ours; the price is the API's */}
              {(price !== undefined || pricing) && (
                <span
                  className={cn(
                    "font-normal opacity-70",
                    stale && "opacity-40",
                  )}
                >
                  ·{" "}
                  {price === undefined ? (
                    <TextSkeleton className="w-14 bg-current opacity-30" />
                  ) : (
                    formatCredits(locale, price)
                  )}
                </span>
              )}
            </Button>
          </BlockedReason>
          {onReselect && (
            <Button type="button" variant="ghost" onClick={onReselect}>
              {dict.reselect}
            </Button>
          )}
        </div>
        {!insufficient && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {dict.credits.balance}:{" "}
            {balance === undefined ? (
              <TextSkeleton className="w-16" />
            ) : (
              formatCredits(locale, balance)
            )}
          </p>
        )}
      </div>
    </form>
  );
}

/** A labelled shadcn Select bound to one form field */
function ChoiceField({
  id,
  label,
  value,
  onChange,
  errors,
  selected,
  description,
  choices,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors: ({ message?: string } | undefined)[];
  /** What the closed trigger shows: just the label, hints are for the list */
  selected: ReactNode;
  description?: string;
  choices: { value: string; label: string; hint?: string }[];
}) {
  const invalid = errors.length > 0;

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
          <SelectValue>{selected}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              <span className="flex flex-col gap-0.5 py-0.5">
                <span>{choice.label}</span>
                {choice.hint && (
                  <span className="text-xs text-muted-foreground">
                    {choice.hint}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={errors} />
    </Field>
  );
}
