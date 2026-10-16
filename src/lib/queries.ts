import {
  type InfiniteData,
  keepPreviousData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { ApiUnreachableError } from "./api";
import type { Session } from "./auth";
import { getBalance, listTransactions } from "./credits";
import type { Locale } from "./i18n";
import type { PickedContent } from "./messages";
import { listPlans } from "./plans";
import { ApiError, type Page, UnauthorizedError } from "./requests";
import {
  deleteOriginal,
  deleteSummary,
  deleteTranslation,
  type Generation,
  getFacets,
  getOptions,
  getSummary,
  getTranslation,
  type HistoryFilter,
  type HistoryItem,
  listSummaries,
  type Quote,
  quoteSummary,
  quoteTranslation,
  type SavedTranslation,
  type SummaryRecord,
  type TranslationQuote,
} from "./summaries";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      // 4xx and signed-out won't fix themselves; a flaky network might
      retry: (failures, error) =>
        failures < 2 &&
        !(error instanceof UnauthorizedError) &&
        !(error instanceof ApiError && error.status < 500),
    },
  },
});

/** FNV-1a: a cheap stable key for a picked text, so re-picking reuses its quote */
function fingerprint(content: PickedContent) {
  let hash = 0x811c9dc5;
  const input = `${content.url}\n${content.title}\n${content.text}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}:${input.length}`;
}

// Scoped by user, so switching accounts never shows someone else's data
const keys = {
  history: (userId: string, filter?: HistoryFilter) =>
    filter
      ? (["history", userId, "list", filter] as const)
      : (["history", userId] as const),
  facets: (userId: string) => ["history", userId, "facets"] as const,
  summary: (userId: string, id: string) => ["summary", userId, id] as const,
  translation: (userId: string, id: string, language: string) =>
    ["summary", userId, id, "translation", language] as const,
  translationQuote: (userId: string, id: string, language: string) =>
    ["translation-quote", userId, id, language] as const,
  balance: (userId: string) => ["credits", userId, "balance"] as const,
  transactions: (userId: string) =>
    ["credits", userId, "transactions"] as const,
  quote: (
    userId: string,
    content: PickedContent,
    locale: Locale,
    generation: Generation,
  ) => ["quote", userId, locale, fingerprint(content), generation] as const,
};

function infiniteList<T>(
  session: Session,
  queryKey: readonly unknown[],
  fetchPage: (
    token: string,
    cursor: string | null,
    signal: AbortSignal,
  ) => Promise<Page<T>>,
) {
  return {
    queryKey,
    queryFn: ({
      pageParam,
      signal,
    }: {
      pageParam: string | null;
      signal: AbortSignal;
    }) => fetchPage(session.token, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<T>) => last.next_cursor,
    select: (data: InfiniteData<Page<T>>) =>
      data.pages.flatMap((page) => page.items),
  };
}

export function useHistory(session: Session, filter: HistoryFilter) {
  return useInfiniteQuery(
    infiniteList(
      session,
      keys.history(session.user.id, filter),
      (token, cursor, signal) => listSummaries(token, filter, cursor, signal),
    ),
  );
}

/** Refetched on open and after creating or deleting (it's under "history") */
export function useFacets(session: Session) {
  return useQuery({
    queryKey: keys.facets(session.user.id),
    queryFn: ({ signal }) => getFacets(session.token, signal),
    staleTime: 0,
  });
}

export function useTransactions(session: Session) {
  return useInfiniteQuery(
    infiniteList(session, keys.transactions(session.user.id), listTransactions),
  );
}

export function useBalance(session: Session) {
  return useQuery({
    queryKey: keys.balance(session.user.id),
    queryFn: ({ signal }) => getBalance(session.token, signal),
    // GET /me already brought one: show it, then confirm
    placeholderData: session.user.credit_balance,
  });
}

/** Credit packs on sale; rarely change */
export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: ({ signal }) => listPlans(signal),
    staleTime: 10 * 60_000,
  });
}

/** Models, styles, lengths and efforts; public and rarely changes */
export function useOptions() {
  return useQuery({
    queryKey: ["options"],
    queryFn: ({ signal }) => getOptions(signal),
    staleTime: 5 * 60_000,
  });
}

/** The price of summarizing `content` this way, before anything is charged */
export function useQuote(
  session: Session,
  content: PickedContent,
  locale: Locale,
  generation: Generation,
  /** Off while the form is invalid: no point pricing what can't be sent */
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: keys.quote(session.user.id, content, locale, generation),
    queryFn: ({ signal }) =>
      quoteSummary(session.token, content, locale, generation, signal),
    // The price only depends on the input; the balance part is refreshed below
    staleTime: 5 * 60_000,
    // Changing an option keeps the old price on screen (dimmed, not clickable)
    // instead of flashing a spinner
    placeholderData: keepPreviousData,
  });
}

/** Keeps every place that shows the balance (and cached quotes) in step */
export function setBalance(session: Session, balance: number) {
  queryClient.setQueryData(keys.balance(session.user.id), balance);
  queryClient.setQueriesData<Quote>(
    { queryKey: ["quote", session.user.id] },
    (quote) =>
      quote && { ...quote, balance, sufficient: balance >= quote.credits },
  );
}

/** 409: the API priced this content differently than the cached quote */
export function setQuotePrice(
  session: Session,
  content: PickedContent,
  locale: Locale,
  generation: Generation,
  credits: number,
) {
  queryClient.setQueryData<Quote>(
    keys.quote(session.user.id, content, locale, generation),
    (quote) =>
      quote && { ...quote, credits, sufficient: quote.balance >= credits },
  );
}

/**
 * A summary failed after it may have been charged: refunds (and, for a dropped
 * stream, a summary that still finished) only show up after a refetch.
 */
export function refreshAfterFailure(
  session: Session,
  { history = false } = {},
) {
  const userId = session.user.id;
  queryClient.invalidateQueries({ queryKey: keys.balance(userId) });
  queryClient.invalidateQueries({ queryKey: keys.transactions(userId) });
  if (history) {
    queryClient.invalidateQueries({ queryKey: keys.history(userId) });
  }
}

/**
 * A summary just paid for: cache it, put it on top of the history and update
 * the balance and the statement.
 */
export function rememberSummary(
  session: Session,
  summary: SummaryRecord & { credit_balance: number },
) {
  const userId = session.user.id;
  queryClient.setQueryData(keys.summary(userId, summary.id), summary);
  setBalance(session, summary.credit_balance);
  addToHistory(userId, summary);
  queryClient.invalidateQueries({ queryKey: keys.history(userId) });
  queryClient.invalidateQueries({ queryKey: keys.transactions(userId) });
}

function isUnfiltered(filter: HistoryFilter | undefined) {
  return Object.values(filter ?? {}).every(
    (value) =>
      value === undefined ||
      (typeof value === "string" ? value.trim() === "" : value.length === 0),
  );
}

/**
 * Puts a new summary on top of the cached history, so opening it shows the
 * summary at once instead of the old list until the refetch lands. A filtered
 * list may or may not include it: unused ones are dropped (they load fresh
 * when opened), the one on screen is refetched by the invalidation
 */
function addToHistory(userId: string, summary: SummaryRecord) {
  const item: HistoryItem = {
    id: summary.id,
    title: summary.title,
    preview: summary.preview,
    source_url: summary.source_url,
    source_title: summary.source_title,
    source_type: summary.source_type,
    source_host: summary.source_host,
    file_extension: summary.file_extension,
    model: summary.model,
    effort: summary.effort,
    credits: summary.credits,
    created_at: summary.created_at,
    translations: summary.translations ?? [],
    language: summary.language,
  };
  for (const query of queryClient
    .getQueryCache()
    .findAll({ queryKey: [...keys.history(userId), "list"] })) {
    const filter = query.queryKey[3] as HistoryFilter | undefined;
    if (!isUnfiltered(filter)) {
      if (query.getObserversCount() === 0)
        queryClient.getQueryCache().remove(query);
      continue;
    }
    queryClient.setQueryData<InfiniteData<Page<HistoryItem>>>(
      query.queryKey,
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page, index) => {
            const items = page.items.filter((other) => other.id !== item.id);
            return { ...page, items: index === 0 ? [item, ...items] : items };
          }),
        },
    );
  }
}

/** Shows the list row (title, preview) right away while the content loads */
export function useSummary(
  session: Session,
  id: string,
  placeholder?: HistoryItem,
) {
  return useQuery({
    queryKey: keys.summary(session.user.id, id),
    queryFn: ({ signal }) => getSummary(session.token, id, signal),
    // Summaries never change once created
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: placeholder && {
      ...placeholder,
      content: "",
      language: "",
      model: "",
      effort: "",
      style: "",
      length: "",
      input_tokens: 0,
      output_tokens: 0,
      credits: 0,
    },
  });
}

/** The price of translating a summary; 0 (cached) when it already exists */
export function useTranslationQuote(
  session: Session,
  summaryId: string,
  language: string,
  enabled: boolean,
) {
  return useQuery({
    enabled,
    queryKey: keys.translationQuote(session.user.id, summaryId, language),
    queryFn: ({ signal }) =>
      quoteTranslation(session.token, summaryId, language, signal),
    staleTime: 5 * 60_000,
  });
}

/** A translation that already exists (free to open); cached for good */
export function useTranslation(
  session: Session,
  summaryId: string,
  language: string | null,
) {
  return useQuery({
    enabled: language !== null,
    queryKey: keys.translation(session.user.id, summaryId, language ?? ""),
    queryFn: ({ signal }) =>
      getTranslation(session.token, summaryId, language ?? "", signal),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * A translation just made (or opened): cache it, add its language to the
 * summary's list, and, when it was charged, update the balance and statement
 */
export function rememberTranslation(
  session: Session,
  translation: SavedTranslation,
) {
  const userId = session.user.id;
  const { summary_id: id, language } = translation;
  queryClient.setQueryData(keys.translation(userId, id, language), translation);
  queryClient.setQueryData<SummaryRecord>(
    keys.summary(userId, id),
    (summary) =>
      summary && {
        ...summary,
        translations: [...new Set([...(summary.translations ?? []), language])],
      },
  );
  // The history rows show which summaries have translations
  queryClient.setQueriesData<InfiniteData<Page<HistoryItem>>>(
    { queryKey: [...keys.history(userId), "list"] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  translations: [
                    ...new Set([...(item.translations ?? []), language]),
                  ],
                }
              : item,
          ),
        })),
      },
  );
  queryClient.setQueryData<TranslationQuote>(
    keys.translationQuote(userId, id, language),
    (quote) => quote && { ...quote, credits: 0, cached: true },
  );
  if (!translation.cached) {
    setBalance(session, translation.credit_balance);
    queryClient.invalidateQueries({ queryKey: keys.transactions(userId) });
    queryClient.invalidateQueries({ queryKey: keys.balance(userId) });
    // The rows above are already right; this confirms them with the API
    queryClient.invalidateQueries({ queryKey: keys.history(userId) });
  }
  // Exact only: the translations cached under it stay as they are
  queryClient.invalidateQueries({
    queryKey: keys.summary(userId, id),
    exact: true,
  });
}

/**
 * Deletes the original version: the oldest translation takes its place (the
 * summary stays in the history, now in that language). Resolves with the
 * updated summary, or undefined if there was nothing left and it's gone
 */
export function useDeleteOriginal(session: Session, summaryId: string) {
  return useMutation({
    mutationFn: () => deleteOriginal(session.token, summaryId),
    onSuccess: (summary) => {
      const userId = session.user.id;
      if (summary) {
        queryClient.setQueryData(keys.summary(userId, summaryId), summary);
        // The promoted language is the original now, not a translation
        queryClient.removeQueries({
          queryKey: keys.translation(userId, summaryId, summary.language),
        });
        queryClient.removeQueries({
          queryKey: ["translation-quote", userId, summaryId],
        });
      } else {
        queryClient.removeQueries({
          queryKey: keys.summary(userId, summaryId),
        });
      }
      // Title, preview, languages (or the whole row) changed
      queryClient.invalidateQueries({ queryKey: keys.history(userId) });
    },
  });
}

/** Deletes one translation, leaving the summary and its other languages */
export function useDeleteTranslation(session: Session, summaryId: string) {
  return useMutation({
    mutationFn: async (language: string) => {
      try {
        await deleteTranslation(session.token, summaryId, language);
      } catch (error) {
        // Already gone (deleted in another window): same outcome. Only the
        // API's own "translation not found": a bare 404 may mean no such route
        if (
          !(error instanceof ApiError) ||
          error.status !== 404 ||
          error.body.error !== "translation not found"
        ) {
          throw error;
        }
      }
    },
    onSuccess: (_, language) => {
      const userId = session.user.id;
      const without = (languages?: string[]) =>
        languages?.filter((other) => other !== language);
      queryClient.removeQueries({
        queryKey: keys.translation(userId, summaryId, language),
      });
      // Priced again from scratch: it's no longer cached for free
      queryClient.removeQueries({
        queryKey: keys.translationQuote(userId, summaryId, language),
      });
      queryClient.setQueryData<SummaryRecord>(
        keys.summary(userId, summaryId),
        (summary) =>
          summary && {
            ...summary,
            translations: without(summary.translations),
          },
      );
      queryClient.setQueriesData<InfiniteData<Page<HistoryItem>>>(
        { queryKey: [...keys.history(userId), "list"] },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === summaryId
                  ? { ...item, translations: without(item.translations) }
                  : item,
              ),
            })),
          },
      );
    },
  });
}

export function useDeleteSummary(session: Session) {
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await deleteSummary(session.token, id);
      } catch (error) {
        // Already gone (deleted in another window): same outcome
        if (!isNotFound(error)) throw error;
      }
    },
    onSuccess: (_, id) => {
      const userId = session.user.id;
      // Every filtered list that has it
      queryClient.setQueriesData<InfiniteData<Page<HistoryItem>>>(
        { queryKey: [...keys.history(userId), "list"] },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== id),
            })),
          },
      );
      queryClient.invalidateQueries({ queryKey: keys.facets(userId) });
      queryClient.removeQueries({ queryKey: keys.summary(userId, id) });
      // The statement shows the title of a deleted summary as "deleted"
      queryClient.invalidateQueries({ queryKey: keys.transactions(userId) });
    },
  });
}

export function isOffline(error: unknown) {
  return error instanceof ApiUnreachableError;
}

export function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}
