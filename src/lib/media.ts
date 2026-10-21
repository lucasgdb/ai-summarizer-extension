// A saved summary (or translation) as media, on ai-summarizer-api: read aloud
// (MP3, /summaries/{id}/audio and /audio/{id}) or as narrated slides (MP4,
// /summaries/{id}/video and /videos/{id}). The same flow for both: a quote,
// a generation (202 and a poll while it's made), and a short-lived link to
// play. One file per summary + language; asking again returns the same one.
import { browser } from "#imports";
import { ApiUnreachableError, api } from "./api";
import { dropSession } from "./auth";
import { slug } from "./export-markdown";
import { ApiError, request, UnauthorizedError } from "./requests";

export type MediaKind = "audio" | "video";

export type MediaStatus = "processing" | "ready" | "failed";

export type SummaryMedia = {
  id: string;
  summary_id: string;
  language: string;
  status: MediaStatus;
  /** Why it failed */
  error: string | null;
  content_type: string;
  size_bytes: number;
  /** Shown before the file has loaded */
  duration_ms: number;
  credits: number;
  created_at: string;
  completed_at: string | null;
  /** Video only */
  width?: number;
  height?: number;
};

export type MediaQuote = {
  credits: number;
  balance: number;
  sufficient: boolean;
  /** Already generated: credits is 0, and `media` is it */
  cached: boolean;
  /** Also there while it's being generated elsewhere, or after a failure */
  media: SummaryMedia | null;
};

/** A short-lived link straight to the (private) bucket: never stored */
export type MediaUrl = { url: string; expires_at: string };

const routes = {
  audio: { create: "audio", item: "audio" },
  video: { create: "video", item: "videos" },
} as const satisfies Record<MediaKind, { create: string; item: string }>;

const createPath = (kind: MediaKind, summaryId: string) =>
  `/summaries/${encodeURIComponent(summaryId)}/${routes[kind].create}`;

const itemPath = (kind: MediaKind, id: string) =>
  `/${routes[kind].item}/${encodeURIComponent(id)}`;

/** No `language`: the summary's original language */
function languageBody(language: string | undefined) {
  return language ? { language } : {};
}

export async function quoteMedia(
  kind: MediaKind,
  token: string,
  summaryId: string,
  language: string | undefined,
  signal: AbortSignal,
): Promise<MediaQuote> {
  // The API names the field after the kind: `audio` or `video`
  const quote = await request<
    Omit<MediaQuote, "media"> & Partial<Record<MediaKind, SummaryMedia | null>>
  >(`${createPath(kind, summaryId)}/quote`, {
    method: "POST",
    token,
    body: languageBody(language),
    signal,
  });
  return {
    credits: quote.credits,
    balance: quote.balance,
    sufficient: quote.sufficient,
    cached: quote.cached,
    media: quote[kind] ?? null,
  };
}

export type CreateMediaResult = {
  /** 200: it already existed (nothing charged). 202: being made, poll it */
  kind: "ready" | "processing";
  media: SummaryMedia;
  /** After the charge (202 for a video, or a fresh audio) */
  credit_balance?: number;
};

export type MediaErrorReason =
  | "offline"
  | "unauthorized"
  | "insufficient" // 402: nothing charged
  | "price-changed" // 409: nothing charged
  | "gone" // 404: the summary or translation was deleted
  | "failed" // 502/503/504: refunded
  | "invalid"; // 400: see `detail` (a language without a voice, too long…)

export class MediaError extends Error {
  constructor(
    readonly reason: MediaErrorReason,
    readonly credits?: { price: number; balance?: number },
    readonly refunded = false,
    /** The API's message, for a 400 */
    readonly detail?: string,
  ) {
    super(reason);
  }
}

/**
 * Generates it at exactly the quoted price. Asynchronous: the API charges and
 * answers 202 while it's made (or 200 with the one that already exists)
 */
export async function createMedia(
  kind: MediaKind,
  token: string,
  summaryId: string,
  language: string | undefined,
  expectedCredits: number,
): Promise<CreateMediaResult> {
  let response: Response;
  try {
    response = await api(createPath(kind, summaryId), {
      method: "POST",
      token,
      body: { ...languageBody(language), expected_credits: expectedCredits },
    });
  } catch (error) {
    if (error instanceof ApiUnreachableError) throw new MediaError("offline");
    throw error;
  }
  if (response.status === 401) {
    await dropSession();
    throw new MediaError("unauthorized");
  }
  const body: SummaryMedia & {
    error?: string;
    credits?: number;
    balance?: number;
    refunded?: boolean;
    credit_balance?: number;
  } = await response.json().catch(() => ({}));
  if (response.ok) {
    return {
      kind:
        response.status === 202 || body.status === "processing"
          ? "processing"
          : "ready",
      media: body,
      credit_balance: body.credit_balance,
    };
  }
  const credits =
    body.credits === undefined
      ? undefined
      : { price: body.credits, balance: body.balance };
  switch (response.status) {
    case 400:
      throw new MediaError("invalid", undefined, false, body.error);
    case 402:
      throw new MediaError("insufficient", credits);
    case 404:
      throw new MediaError("gone");
    case 409:
      throw new MediaError("price-changed", credits);
    default:
      throw new MediaError("failed", undefined, body.refunded === true);
  }
}

export function getMedia(
  kind: MediaKind,
  token: string,
  id: string,
  signal: AbortSignal,
) {
  return request<SummaryMedia>(itemPath(kind, id), { token, signal });
}

/**
 * A fresh link to play it (valid 30 minutes, free). 409: not ready yet;
 * 404: deleted
 */
export async function getMediaUrl(kind: MediaKind, token: string, id: string) {
  try {
    return await request<MediaUrl>(`${itemPath(kind, id)}/url`, { token });
  } catch (error) {
    if (error instanceof ApiUnreachableError) throw new MediaError("offline");
    if (error instanceof UnauthorizedError) {
      throw new MediaError("unauthorized");
    }
    if (error instanceof ApiError && error.status === 404) {
      throw new MediaError("gone");
    }
    throw error;
  }
}

/** Asked for on the first export (it must run straight from the click) */
export function requestDownloads() {
  return browser.permissions.request({ permissions: ["downloads"] });
}

/**
 * Saves the file as the API stores it (no re-encoding: the best quality there
 * is) under the summary's name, like the Markdown export: "go-linguagem.mp3".
 * Chrome's downloads API, because a `download` link to the bucket (another
 * origin) would ignore the name
 */
export async function downloadMedia(
  kind: MediaKind,
  token: string,
  media: SummaryMedia,
  title: string,
) {
  const link = await getMediaUrl(kind, token, media.id);
  const type = media.content_type;
  const extension = type.includes("mpeg")
    ? "mp3"
    : (type.split("/")[1] ?? (kind === "video" ? "mp4" : "mp3"));
  await browser.downloads.download({
    url: link.url,
    filename: `${slug(title)}.${extension}`,
  });
}

/** Why it can't be made for this summary + language, from the API's 400 */
export type MediaUnavailable = "language" | "too-long" | "no-text" | "other";

export function unavailableReason(
  message: string | undefined,
): MediaUnavailable {
  if (!message) return "other";
  if (/language/i.test(message)) return "language";
  if (/too long/i.test(message)) return "too-long";
  if (/no text/i.test(message)) return "no-text";
  return "other";
}
