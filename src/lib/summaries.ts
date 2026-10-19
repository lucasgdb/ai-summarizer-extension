// /summaries on ai-summarizer-api: quote, create, history list, detail, delete
import { ApiUnreachableError, api } from "./api";
import { dropSession } from "./auth";
import type { Locale } from "./i18n";
import type { PickedContent } from "./messages";
import { ApiError, type Page, pageQuery, request } from "./requests";
import { readEvents } from "./sse";

// Limits of POST /summaries (ai-summarizer-api, internal/summaries/handler.go)
const maxTitleLength = 500;
const maxUrlLength = 2048;

// The API pings every 15 s while the model reasons: this much silence means
// the connection is gone (the summary itself may still finish server-side)
const idleTimeoutMs = 45_000;

/** POST /summaries and GET /summaries/{id} */
export type SummaryRecord = {
  id: string;
  title: string;
  /** 1–2 plain-text sentences for the history list */
  preview: string;
  /** GitHub-flavored Markdown */
  content: string;
  source_url: string | null;
  source_title: string | null;
  /** What was summarized */
  source_type: SourceType;
  /** The site, without "www."; null for a local PDF */
  source_host: string | null;
  /** "pdf", "txt", "md"…; null for ordinary pages and extensionless downloads */
  file_extension: string | null;
  language: string;
  model: string;
  effort: string;
  style: string;
  length: string;
  input_tokens: number;
  output_tokens: number;
  /** What it cost */
  credits: number;
  /** Languages it's been translated to ([] if none); absent right after creating */
  translations?: string[];
  created_at: string;
};

/** One row of GET /summaries */
export type HistoryItem = Pick<
  SummaryRecord,
  | "id"
  | "title"
  | "preview"
  | "source_url"
  | "source_title"
  | "source_type"
  | "source_host"
  | "file_extension"
  | "model"
  | "effort"
  | "credits"
  | "created_at"
  | "translations"
> &
  // The original language; in the list once the API sends it (it's always in
  // the detail), until then the row shows only the translations
  Partial<Pick<SummaryRecord, "language">>;

export type Quote = {
  credits: number;
  balance: number;
  sufficient: boolean;
};

/**
 * "text" is set by the API itself for a page whose URL is a text file (.txt,
 * .md, .json, code…); the extension only ever sends the other three
 */
export type SourceType = "webpage" | "selection" | "pdf" | "text";

const sourceTypes: Record<
  PickedContent["source"],
  Exclude<SourceType, "text">
> = {
  page: "webpage",
  element: "selection",
  pdf: "pdf",
};

/** GET /summaries filters; all optional and combinable */
export type HistoryFilter = {
  /** Title, preview, page title and site; accents and case ignored */
  q?: string;
  sourceTypes?: SourceType[];
  host?: string;
  model?: string;
  style?: string;
  /** ISO 8601; `from` inclusive, `to` exclusive */
  from?: string;
  to?: string;
};

export type Facet = { value: string; count: number };

/** GET /summaries/facets: what exists in the user's history, to build filters */
export type HistoryFacets = {
  source_types: Facet[];
  models: Facet[];
  styles: Facet[];
  /** The 20 most summarized sites */
  hosts: Facet[];
};

/** GET /summaries/options: what the selectors offer (models come from the DB) */
export type SummaryOptions = {
  models: { id: string; name: string; description: string; default: boolean }[];
  efforts: string[];
  styles: string[];
  lengths: string[];
  /** What a summary can be written in ("en", "pt"…) */
  languages: string[];
  defaults: {
    model: string;
    effort: string;
    style: string;
    length: string;
    language: string;
  };
  max_instructions_length: number;
};

/** How the summary is generated; part of the price */
export type Generation = {
  // Omitted (no saved choice and no /summaries/options): the API's defaults
  model?: string;
  effort?: string;
  style?: string;
  length?: string;
  /** Unset: the UI's language */
  language?: string;
  instructions: string;
};

/** Public; the API caches it for 5 minutes */
export async function getOptions(signal: AbortSignal): Promise<SummaryOptions> {
  const response = await api("/summaries/options", { signal });
  if (!response.ok) throw new ApiError(response.status, {});
  return response.json();
}

const apiLanguages: Record<Locale, "en" | "pt"> = { en: "en", "pt-br": "pt" };

/** The summary language that matches the UI, until the user picks another */
export function uiLanguage(locale: Locale) {
  return apiLanguages[locale];
}

/** Same body for the quote and the summary, so both price the same input */
function summaryBody(
  content: PickedContent,
  locale: Locale,
  generation: Generation,
) {
  return {
    title: content.title.slice(0, maxTitleLength),
    url: content.url.length <= maxUrlLength ? content.url : "",
    text: content.text,
    // For the history and its filters; doesn't change the price
    source_type: sourceTypes[content.source],
    ...generation,
    // After the spread: an unset language must not become "omitted" (the
    // API would then default to English)
    language: generation.language || apiLanguages[locale],
  };
}

export function quoteSummary(
  token: string,
  content: PickedContent,
  locale: Locale,
  generation: Generation,
  signal: AbortSignal,
) {
  return request<Quote>("/summaries/quote", {
    method: "POST",
    token,
    body: summaryBody(content, locale, generation),
    signal,
  });
}

export function listSummaries(
  token: string,
  filter: HistoryFilter,
  cursor: string | null,
  signal: AbortSignal,
) {
  // The same filters on every page; a new filter starts over without a cursor
  const query = pageQuery(cursor);
  const set = (name: string, value: string | undefined) => {
    if (value) query.set(name, value);
  };
  set("q", filter.q?.trim().slice(0, 100));
  set("source_type", filter.sourceTypes?.join(","));
  set("host", filter.host);
  set("model", filter.model);
  set("style", filter.style);
  set("from", filter.from);
  set("to", filter.to);
  return request<Page<HistoryItem>>(`/summaries?${query}`, { token, signal });
}

export function getFacets(token: string, signal: AbortSignal) {
  return request<HistoryFacets>("/summaries/facets", { token, signal });
}

export function getSummary(token: string, id: string, signal: AbortSignal) {
  return request<SummaryRecord>(`/summaries/${encodeURIComponent(id)}`, {
    token,
    signal,
  });
}

export function deleteSummary(token: string, id: string) {
  return request<void>(`/summaries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

export type SummaryErrorReason =
  | "offline" // API unreachable
  | "unauthorized" // session expired or revoked: sign in again
  | "insufficient" // 402: not enough credits (nothing was charged)
  | "price-changed" // 409: the quote is stale (nothing was charged)
  | "unavailable" // AI not configured (503) or failed upstream (502), refunded
  | "timeout" // 504 or the model timed out mid-stream, refunded
  | "interrupted" // the stream dropped: it may still finish and be charged
  | "incomplete" // failed after the text started: charged, not saved
  | "invalid"; // 400: the API rejected the request

export class SummaryError extends Error {
  constructor(
    readonly reason: SummaryErrorReason,
    /** From 402/409: the current price and, on 402, the balance */
    readonly credits?: { price: number; balance?: number },
    /** The API's message, shown for 400s ("unknown model", ...) */
    readonly detail?: string,
    /** From a stream's `error` event: the charge was returned */
    readonly refunded?: boolean,
  ) {
    super(detail ?? reason);
  }
}

function reasonFor(status: number): SummaryErrorReason {
  switch (status) {
    case 400:
      return "invalid";
    case 402:
      return "insufficient";
    case 409:
      return "price-changed";
    case 504:
      return "timeout";
    default:
      return "unavailable";
  }
}

export type SavedSummary = SummaryRecord & { credit_balance: number };

export type StreamHandlers = {
  /** Charged; the model may think a while before the first text */
  onStart: (charge: { credits: number; credit_balance: number }) => void;
  onTitle: (text: string) => void;
  onPreview: (text: string) => void;
  /** The next piece of the Markdown */
  onDelta: (text: string) => void;
};

function parse<T>(data: string): T {
  return JSON.parse(data) as T;
}

/**
 * Summarizes the content in the UI language at exactly `expectedCredits` (the
 * quote the user saw), streaming the text as the model writes it. Resolves
 * with the saved summary; rejects with SummaryError.
 *
 * `signal` only stops reading: the API finishes and saves (and charges) the
 * summary anyway once it started.
 */
export async function streamSummary(
  content: PickedContent,
  locale: Locale,
  generation: Generation,
  expectedCredits: number,
  token: string,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<SavedSummary> {
  return streamPost<SavedSummary>(
    "/summaries",
    {
      ...summaryBody(content, locale, generation),
      expected_credits: expectedCredits,
    },
    token,
    handlers,
    signal,
  );
}

/**
 * POST with `Accept: text/event-stream`, for summaries and translations (same
 * events: start, delta…, title, preview, then done or error). Resolves with
 * the `done` body; rejects with SummaryError.
 */
async function streamPost<Done>(
  path: string,
  body: unknown,
  token: string,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<Done> {
  const idle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(), idleTimeoutMs);
  };

  try {
    touch();
    let response: Response;
    try {
      response = await api(path, {
        method: "POST",
        token,
        accept: "text/event-stream",
        body,
        signal: AbortSignal.any([signal, idle.signal]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      if (idle.signal.aborted) throw new SummaryError("timeout");
      if (error instanceof ApiUnreachableError) {
        throw new SummaryError("offline");
      }
      throw error;
    }

    // 400/401/402/404/409/503 come before the stream, as plain JSON: nothing charged
    if (response.status === 401) {
      await dropSession();
      throw new SummaryError("unauthorized");
    }
    if (!response.ok || !response.body) {
      const failure: { error?: string; credits?: number; balance?: number } =
        await response.json().catch(() => ({}));
      throw new SummaryError(
        reasonFor(response.status),
        failure.credits === undefined
          ? undefined
          : { price: failure.credits, balance: failure.balance },
        failure.error,
      );
    }

    try {
      for await (const { event, data } of readEvents(response.body, touch)) {
        switch (event) {
          case "start":
            handlers.onStart(parse(data));
            break;
          case "title":
            handlers.onTitle(parse<{ text: string }>(data).text);
            break;
          case "preview":
            handlers.onPreview(parse<{ text: string }>(data).text);
            break;
          case "delta":
            handlers.onDelta(parse<{ text: string }>(data).text);
            break;
          case "done":
            return parse<Done>(data);
          case "error": {
            // refunded: the API returned the charge (the partial text can
            // go). Not refunded: it failed after the text started, so it
            // stays charged, and the partial text is all there is
            const failure = parse<{ error: string; refunded?: boolean }>(data);
            const refunded = failure.refunded !== false;
            throw new SummaryError(
              !refunded
                ? "incomplete"
                : /timed out/i.test(failure.error)
                  ? "timeout"
                  : "unavailable",
              undefined,
              failure.error,
              refunded,
            );
          }
        }
      }
    } catch (error) {
      if (error instanceof SummaryError || signal.aborted) throw error;
      // Network dropped or went silent mid-stream
      throw new SummaryError("interrupted");
    }
    // Closed without "done" or "error"
    throw new SummaryError("interrupted");
  } finally {
    clearTimeout(timer);
  }
}

/** A summary in another language, made from the saved summary (not the page) */
export type Translation = {
  id: string;
  summary_id: string;
  language: string;
  title: string;
  preview: string;
  /** Markdown */
  content: string;
  model: string;
  /** What it cost when it was made */
  credits: number;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
};

export type SavedTranslation = Translation & {
  /** The saved translation: nothing was charged */
  cached: boolean;
  credit_balance: number;
};

export type TranslationQuote = Quote & {
  /** Already translated: credits is 0 */
  cached: boolean;
};

const translatePath = (id: string) =>
  `/summaries/${encodeURIComponent(id)}/translate`;

export function quoteTranslation(
  token: string,
  id: string,
  language: string,
  signal: AbortSignal,
) {
  return request<TranslationQuote>(`${translatePath(id)}/quote`, {
    method: "POST",
    token,
    body: { language },
    signal,
  });
}

/**
 * Opens a translation that already exists (free). `expected_credits: 0` makes
 * it safe: if it doesn't exist after all, the API answers 409 instead of
 * charging for a new one.
 */
export function getTranslation(
  token: string,
  id: string,
  language: string,
  signal: AbortSignal,
) {
  return request<SavedTranslation>(translatePath(id), {
    method: "POST",
    token,
    body: { language, expected_credits: 0 },
    signal,
  });
}

/**
 * Deletes the original but keeps the summary: its oldest translation becomes
 * the original (200 with the updated summary). Without translations the
 * summary is simply deleted (204, nothing returned)
 */
export function deleteOriginal(token: string, id: string) {
  return request<SummaryRecord | undefined>(
    `/summaries/${encodeURIComponent(id)}/original`,
    { method: "DELETE", token },
  );
}

/**
 * Deletes one translation; the summary and its other translations stay.
 * Credits aren't refunded, as with deleting a summary.
 */
export function deleteTranslation(token: string, id: string, language: string) {
  return request<void>(
    `/summaries/${encodeURIComponent(id)}/translations/${encodeURIComponent(language)}`,
    { method: "DELETE", token },
  );
}

/** Translates at exactly the quoted price, streaming it as it's written */
export function streamTranslation(
  token: string,
  id: string,
  language: string,
  expectedCredits: number,
  handlers: StreamHandlers,
  signal: AbortSignal,
) {
  return streamPost<SavedTranslation>(
    translatePath(id),
    { language, expected_credits: expectedCredits },
    token,
    handlers,
    signal,
  );
}
