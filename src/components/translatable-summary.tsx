import { LanguagesIcon, XIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { BlockedReason } from "@/components/blocked-reason";
import { DeleteButton } from "@/components/delete-button";
import { MediaControl } from "@/components/summary-media";
import { type SummaryShape, SummaryView } from "@/components/summary-view";
import { TextSkeleton } from "@/components/text-skeleton";
import { ToggleChip } from "@/components/toggle-chip";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAudioGenerating } from "@/lib/audio-busy";
import type { Session } from "@/lib/auth";
import { useBuyCredits } from "@/lib/buy-credits";
import { insufficientMessage } from "@/lib/credits-messages";
import {
  formatCredits,
  getDictionary,
  languageLabel,
  languageName,
  localeConfig,
} from "@/lib/i18n";
import {
  clearTranslationFailure,
  type TranslationFailure as Failure,
  forgetTranslation,
  startTranslation,
  useLiveTranslations,
} from "@/lib/live-translations";
import {
  useBalance,
  useDeleteOriginal,
  useDeleteTranslation,
  useOptions,
  useTranslation,
  useTranslationQuote,
} from "@/lib/queries";
import type { SummaryRecord, Translation } from "@/lib/summaries";
import { useLocale } from "@/lib/use-locale";

function asShape(
  summary: SummaryRecord,
  translation: Translation,
): SummaryShape {
  return {
    ...summary,
    title: translation.title,
    content: translation.content,
    model: translation.model,
    // Always the default model at low effort: not worth a label of its own
    effort: "",
    credits: translation.credits,
    created_at: translation.created_at,
  };
}

/**
 * A saved summary with its translations: "Original · Português" to switch
 * between them, and "Translate to …" (priced) for the languages it lacks.
 * A new translation streams in like a summary.
 */
export function TranslatableSummary({
  session,
  summary,
  onDeleteSummary,
  deletingSummary = false,
  onGone,
}: {
  session: Session;
  summary: SummaryRecord;
  /** Deletes the whole summary (with its translations); omitted, no Delete */
  onDeleteSummary?: () => void;
  deletingSummary?: boolean;
  /** The summary is gone (its last version was deleted) */
  onGone?: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const languages = useOptions().data?.languages ?? [];

  // In progress, finished and failed translations live outside this screen
  // (lib/live-translations), so they carry on when it changes or goes away
  const live = useLiveTranslations(summary.id);
  const streaming = live.streaming.map((entry) => entry.language);
  const translated = [
    ...new Set([...(summary.translations ?? []), ...live.finished]),
  ];
  // What the API can write that this summary doesn't have (or isn't writing)
  const targets = languages.filter(
    (language) =>
      language !== summary.language &&
      !translated.includes(language) &&
      !streaming.includes(language),
  );

  const [picked, setPicked] = useState<string>(summary.language);
  // A tab that no longer exists (deleted, failed, promoted) falls back to the
  // original instead of showing nothing
  const shown =
    picked === summary.language ||
    translated.includes(picked) ||
    streaming.includes(picked)
      ? picked
      : summary.language;
  const setShown = setPicked;
  // Only the tab being written shows the text as it comes; the others show
  // their own version while it goes on in the background
  const draft = live.streaming.find((entry) => entry.language === shown);
  const showingTranslation = shown !== summary.language && !draft;
  const failure = live.failure;
  const translation = useTranslation(
    session,
    summary.id,
    showingTranslation ? shown : null,
  );
  const removeTranslation = useDeleteTranslation(session, summary.id);
  const removeOriginal = useDeleteOriginal(session, summary.id);
  // Saved translations, oldest first (the API's order): the first one takes
  // the original's place when it's deleted
  const savedTranslations = summary.translations ?? [];

  // Delete acts on what's on screen: the open translation alone, or (on the
  // original) the whole summary
  let actions: ReactNode;
  if (showingTranslation && translation.data) {
    const language = shown;
    actions = (
      <DeleteButton
        title={dict.history.deleteTranslationTitle(
          languageName(locale, language),
        )}
        body={dict.history.deleteTranslationBody}
        pending={removeTranslation.isPending}
        onConfirm={() =>
          removeTranslation.mutate(language, {
            onSuccess: () => {
              forgetTranslation(summary.id, language);
              setShown(summary.language);
            },
          })
        }
      />
    );
  } else if (shown === summary.language && onDeleteSummary) {
    const next = savedTranslations[0];
    actions = next ? (
      // Translated: deleting the original promotes the next version, so the
      // summary stays; "everything" is still one click away
      <DeleteButton
        title={dict.history.deleteOriginalTitle(
          languageName(locale, summary.language),
        )}
        body={dict.history.deleteOriginalBody(languageName(locale, next))}
        confirmLabel={dict.history.deleteOriginal}
        alternative={{
          label: dict.history.deleteEverything,
          onConfirm: onDeleteSummary,
        }}
        pending={deletingSummary || removeOriginal.isPending}
        onConfirm={() =>
          removeOriginal.mutate(undefined, {
            onSuccess: (updated) => {
              if (!updated) {
                onGone?.();
                return;
              }
              forgetTranslation(summary.id, updated.language);
              setShown(updated.language);
            },
          })
        }
      />
    ) : (
      <DeleteButton
        title={dict.history.deleteTitle}
        body={dict.history.deleteBody}
        pending={deletingSummary}
        onConfirm={onDeleteSummary}
      />
    );
  }

  function translate(language: string, price: number) {
    setShown(language);
    startTranslation(session, summary, language, price);
  }

  const view: SummaryShape =
    draft?.shape ??
    (showingTranslation
      ? translation.data
        ? asShape(summary, translation.data)
        : // Opening a saved one: same layout, content still on its way
          { ...summary, title: "", content: "", effort: "", credits: 0 }
      : summary);

  return (
    <div className="space-y-5">
      {(translated.length > 0 || streaming.length > 0) && (
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">{dict.translate.languages}</legend>
          <ToggleChip
            label={dict.translate.original(
              languageLabel(locale, summary.language),
            )}
            pressed={shown === summary.language}
            onClick={() => setShown(summary.language)}
          />
          {[...new Set([...translated, ...streaming])].map((language) => (
            <ToggleChip
              key={language}
              label={languageLabel(locale, language)}
              pressed={shown === language}
              onClick={() => setShown(language)}
            />
          ))}
        </fieldset>
      )}

      <SummaryView
        summary={view}
        streaming={draft !== undefined}
        actions={actions}
      />

      {/* The version on screen as audio and as video, side by side, once
          its text is here (not while a translation is still being written).
          A player takes the whole row */}
      {!draft && view.content !== "" && (
        <div className="flex flex-wrap items-start gap-2">
          {(["audio", "video"] as const).map((kind) => (
            <MediaControl
              key={`${kind}:${summary.id}:${shown}`}
              kind={kind}
              session={session}
              summaryId={summary.id}
              language={shown === summary.language ? undefined : shown}
              title={view.title}
            />
          ))}
        </div>
      )}

      {targets.length > 0 && (
        <TranslateControl
          session={session}
          summaryId={summary.id}
          targets={targets}
          onTranslate={translate}
          onOpen={setShown}
        />
      )}

      {failure && (
        <TranslationFailure
          failure={failure}
          onDismiss={() => clearTranslationFailure(summary.id)}
        />
      )}
      {(removeTranslation.isError || removeOriginal.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {dict.history.deleteError}
        </p>
      )}
    </div>
  );
}

/** On top of "Translate to…", in this order, whatever the UI language */
const priorityLanguages = ["en", "pt"];

/**
 * One language picker and one priced button: with ten languages, a button
 * each would mean ten quotes (and requests) just to show the screen
 */
function TranslateControl({
  session,
  summaryId,
  targets,
  onTranslate,
  onOpen,
}: {
  session: Session;
  summaryId: string;
  targets: string[];
  onTranslate: (language: string, price: number) => void;
  onOpen: (language: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const id = useId();
  // English and Portuguese first (the ones most asked for), then the rest
  // by the name shown, in the UI's language
  const rank = (language: string) => {
    const index = priorityLanguages.indexOf(language);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  const options = [...targets].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      languageLabel(locale, a).localeCompare(
        languageLabel(locale, b),
        localeConfig[locale].intl,
      ),
  );
  const [picked, setPicked] = useState<string | null>(null);
  // The first of the list; and a pick that's just been translated (so no
  // longer a target) falls back to the new first
  const fallback = options[0] ?? "";
  const target = picked && targets.includes(picked) ? picked : fallback;
  // One paid action at a time: not while an audio is being generated
  const generating = useAudioGenerating();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${id}-target`} className="sr-only">
        {dict.translate.target}
      </label>
      <Select value={target} onValueChange={setPicked} disabled={generating}>
        <SelectTrigger id={`${id}-target`} size="sm" className="min-w-40">
          {/* One group on the left: justify-between would float the language
              alone in the middle of the trigger */}
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <LanguagesIcon className="text-muted-foreground" />
            <SelectValue />
          </span>
        </SelectTrigger>
        {/* Above the trigger, not over it, with every language in view
            (item-aligned would cover the trigger and scroll with arrows) */}
        <SelectContent position="popper" side="top" align="start">
          {options.map((language) => (
            <SelectItem key={language} value={language}>
              {languageLabel(locale, language)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TranslateButton
        session={session}
        summaryId={summaryId}
        language={target}
        blocked={generating}
        onTranslate={(price) => onTranslate(target, price)}
        onOpen={() => onOpen(target)}
      />
    </div>
  );
}

function TranslateButton({
  session,
  summaryId,
  language,
  blocked = false,
  onTranslate,
  onOpen,
}: {
  session: Session;
  summaryId: string;
  language: string;
  /** Another paid action is running (an audio being generated) */
  blocked?: boolean;
  onTranslate: (price: number) => void;
  /** It exists already (the quote says so): just switch to it */
  onOpen: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const quote = useTranslationQuote(session, summaryId, language, true);
  const balance = useBalance(session).data ?? quote.data?.balance;
  const price = quote.data?.credits;
  const cached = quote.data?.cached ?? false;
  const insufficient =
    !cached &&
    ((quote.data !== undefined && !quote.data.sufficient) ||
      (price !== undefined && balance !== undefined && balance < price));
  const name = languageLabel(locale, language);
  const buyCredits = useBuyCredits();
  // Why it's disabled, when there's something to say
  const reason = blocked
    ? dict.audio.busy
    : insufficient && price !== undefined && balance !== undefined
      ? insufficientMessage(dict, locale, price, balance)
      : null;

  return (
    <>
      <BlockedReason reason={reason}>
        <Button
          variant="outline"
          size="sm"
          disabled={blocked || quote.isPending || insufficient}
          onClick={() => {
            if (cached) onOpen();
            else if (price !== undefined) onTranslate(price);
          }}
        >
          {/* The picker names the language; already translated: free to open.
          No spinner: it would push the label around while the price loads */}
          {cached ? dict.translate.open(name) : dict.translate.translate}
          {!cached && (
            <span className="font-normal text-muted-foreground">
              ·{" "}
              {price === undefined ? (
                // Only the number comes from the API: "· ▭ credits"
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
      </BlockedReason>
      {insufficient && buyCredits && (
        <Button variant="ghost" size="sm" onClick={buyCredits}>
          {dict.buy.open}
        </Button>
      )}
    </>
  );
}

/** Kept with the store (it outlives this screen) until dismissed or retried */
function TranslationFailure({
  failure,
  onDismiss,
}: {
  failure: Failure;
  onDismiss: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const { reason, price, balance } = failure;
  const buyCredits = useBuyCredits();

  const message =
    reason === "insufficient" && price !== undefined && balance !== undefined
      ? insufficientMessage(dict, locale, price, balance)
      : reason === "price-changed" && price !== undefined
        ? dict.translate.priceChanged(formatCredits(locale, price))
        : reason === "incomplete"
          ? dict.translate.incomplete(languageName(locale, failure.language))
          : reason === "interrupted"
            ? dict.translate.interrupted
            : reason === "offline"
              ? dict.summaryErrors.offline.title
              : `${dict.translate.failed} ${
                  reason === "unavailable" || reason === "timeout"
                    ? dict.credits.refunded
                    : ""
                }`;

  return (
    <div role="alert" className="flex items-start gap-2">
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{message}</p>
        {/* Charged but not saved: the text that arrived is all there is */}
        {failure.partial && (
          <div className="mt-3 rounded-lg border p-3">
            <SummaryView summary={failure.partial} />
          </div>
        )}
        {reason === "insufficient" && buyCredits && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={buyCredits}
          >
            {dict.buy.open}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={dict.close}
        onClick={onDismiss}
      >
        <XIcon />
      </Button>
    </div>
  );
}
