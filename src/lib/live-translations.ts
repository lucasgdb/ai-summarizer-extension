import { useSyncExternalStore } from "react";
import type { SummaryShape } from "@/components/summary-view";
import type { Session } from "./auth";
import {
  queryClient,
  refreshAfterFailure,
  refundBalance,
  rememberTranslation,
  setBalance,
} from "./queries";
import {
  SummaryError,
  type SummaryErrorReason,
  type SummaryRecord,
  streamTranslation,
} from "./summaries";

export type LiveTranslation = { language: string; shape: SummaryShape };

export type TranslationFailure = {
  language: string;
  reason: SummaryErrorReason;
  price?: number;
  balance?: number;
  /** "incomplete": what arrived before it failed (charged, not saved) */
  partial?: SummaryShape;
};

type Entry = {
  /** Being written right now, with the text so far */
  streaming: LiveTranslation[];
  /** Finished in this session (a summary handed in by the summarize screen
   * isn't the cached record, so its `translations` don't grow on their own) */
  finished: string[];
  failure: TranslationFailure | null;
};

/**
 * Translations in progress, outside React: they outlive the screen that
 * started them. Switching tabs, opening another summary or leaving the history
 * keeps them going, and coming back shows them where they are.
 */
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const empty: Entry = { streaming: [], finished: [], failure: null };

// Never aborted: a translation the API started is charged and saved anyway,
// so it's read to the end and cached even if nobody is looking
const keepReading = new AbortController().signal;

function update(summaryId: string, change: (entry: Entry) => Entry) {
  entries.set(summaryId, change(entries.get(summaryId) ?? empty));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLiveTranslations(summaryId: string) {
  return useSyncExternalStore(subscribe, () => entries.get(summaryId) ?? empty);
}

export function clearTranslationFailure(summaryId: string) {
  update(summaryId, (entry) => ({ ...entry, failure: null }));
}

/** After deleting a translation, or promoting it to the original */
export function forgetTranslation(summaryId: string, language: string) {
  update(summaryId, (entry) => ({
    ...entry,
    finished: entry.finished.filter((other) => other !== language),
  }));
}

/** Translates at exactly the quoted price; progress goes to the store */
export async function startTranslation(
  session: Session,
  summary: SummaryRecord,
  language: string,
  price: number,
) {
  const id = summary.id;
  let shape: SummaryShape = {
    ...summary,
    title: "",
    content: "",
    effort: "",
    credits: 0,
    created_at: new Date().toISOString(),
  };
  // In place: moving it to the end on every delta would reorder the tabs
  // whenever two translations run at once (they'd keep swapping)
  const replace = (next: SummaryShape | null) =>
    update(id, (entry) => {
      if (!next) {
        return {
          ...entry,
          streaming: entry.streaming.filter(
            (live) => live.language !== language,
          ),
        };
      }
      const exists = entry.streaming.some((live) => live.language === language);
      return {
        ...entry,
        streaming: exists
          ? entry.streaming.map((live) =>
              live.language === language ? { language, shape: next } : live,
            )
          : [...entry.streaming, { language, shape: next }],
      };
    });
  update(id, (entry) => ({ ...entry, failure: null }));
  replace(shape);

  // What onStart charged, to put back on the balance if it's refunded
  let charged = 0;
  // Deltas arrive faster than it's worth re-rendering: one paint per frame
  let frame = 0;
  const change = (patch: Partial<SummaryShape>) => {
    shape = { ...shape, ...patch };
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      replace(shape);
    });
  };

  try {
    const result = await streamTranslation(
      session.token,
      id,
      language,
      price,
      {
        onStart: (charge) => {
          charged = charge.credits;
          if (charge.credits > 0) setBalance(session, charge.credit_balance);
          change({ credits: charge.credits });
        },
        onTitle: (title) => change({ title }),
        onPreview: () => {},
        onDelta: (text) => change({ content: shape.content + text }),
      },
      keepReading,
    );
    cancelAnimationFrame(frame);
    rememberTranslation(session, result);
    replace(null);
    update(id, (entry) => ({
      ...entry,
      finished: [...new Set([...entry.finished, language])],
    }));
  } catch (error) {
    cancelAnimationFrame(frame);
    replace(null);
    const reason = error instanceof SummaryError ? error.reason : "unavailable";
    if (reason === "unauthorized") return;
    // Returned by the API: on the balance right away (the refetch confirms)
    if (error instanceof SummaryError && error.refunded) {
      refundBalance(session, charged);
    }
    const credits = error instanceof SummaryError ? error.credits : undefined;
    if (credits?.balance !== undefined) setBalance(session, credits.balance);
    if (reason === "price-changed" || reason === "insufficient") {
      // Nothing charged: the button shows the current price again
      queryClient.invalidateQueries({
        queryKey: ["translation-quote", session.user.id, id, language],
      });
    } else {
      refreshAfterFailure(session);
    }
    if (reason === "interrupted") {
      // It may still finish: the detail will list it once it's saved
      queryClient.invalidateQueries({
        queryKey: ["summary", session.user.id, id],
      });
    }
    update(id, (entry) => ({
      ...entry,
      failure: {
        language,
        reason,
        price: credits?.price,
        balance: credits?.balance,
        // The title comes after the text: the summary's stands in
        partial:
          reason === "incomplete"
            ? { ...shape, title: shape.title || summary.title }
            : undefined,
      },
    }));
  }
}
