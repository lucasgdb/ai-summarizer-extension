// /forms on ai-summarizer-api: fill a form from the user's own context.
// Nothing is saved to the history; it's charged like a summary.
import { ApiUnreachableError, api } from "./api";
import { dropSession } from "./auth";
import type { FormAnswer, ScannedForm } from "./messages";
import { ApiError, request, UnauthorizedError } from "./requests";
import { readEvents } from "./sse";
import type { Quote } from "./summaries";

/** GET /forms/options: what the selectors offer */
export type FormOptions = {
  models: { id: string; name: string; description: string; default: boolean }[];
  efforts: string[];
  languages: string[];
  /** "formal", "neutral", "friendly", "direct" */
  tones: string[];
  /** For open answers: "short", "medium", "long" */
  answer_lengths: string[];
  defaults: {
    effort: string;
    tone: string;
    answer_length: string;
    /** "auto": the form's own language */
    language: string;
  };
  max_fields: number;
  max_context_length: number;
};

/** How the answers are written; part of the price */
export type FillChoices = {
  // No model: the API fills forms with its cheapest one
  effort?: string;
  tone?: string;
  answer_length?: string;
  /** "auto" or a language code */
  language?: string;
  /** Leave fields that already have an answer alone (they aren't sent) */
  only_empty: boolean;
};

export type FillResult = {
  answers: FormAnswer[];
  credits: number;
  credit_balance: number;
};

export type FillErrorReason =
  | "offline"
  | "unauthorized"
  | "insufficient" // 402: nothing charged
  | "price-changed" // 409: nothing charged
  | "unavailable" // 502/503: refunded (or never charged)
  | "timeout" // 504: refunded
  | "interrupted" // the stream dropped after charging: the API may finish it
  | "incomplete" // failed after answers arrived: charged, those answers stay
  | "invalid"; // 400

export class FillError extends Error {
  constructor(
    readonly reason: FillErrorReason,
    readonly credits?: { price: number; balance?: number },
    readonly detail?: string,
    /** From the stream's `error`: the charge was returned */
    readonly refunded?: boolean,
  ) {
    super(detail ?? reason);
  }
}

/** Public; like /summaries/options */
export async function getFormOptions(
  signal: AbortSignal,
): Promise<FormOptions> {
  const response = await api("/forms/options", { signal });
  if (!response.ok) throw new ApiError(response.status, {});
  return response.json();
}

/** Same body for the quote and the fill, so both price the same input */
function fillBody(form: ScannedForm, context: string, choices: FillChoices) {
  return {
    title: form.title,
    url: form.url,
    context,
    ...choices,
    // Only empty: the answered ones stay out (not even their labels go).
    // Otherwise every field is to be answered anew, so none goes as
    // "filled": the model took that as "already done" and left them alone
    fields: choices.only_empty
      ? form.fields.filter((field) => !field.filled)
      : form.fields.map((field) => ({ ...field, filled: false })),
  };
}

export function quoteFill(
  token: string,
  form: ScannedForm,
  context: string,
  choices: FillChoices,
  signal: AbortSignal,
) {
  return request<Quote>("/forms/quote", {
    method: "POST",
    token,
    body: fillBody(form, context, choices),
    signal,
  });
}

function reasonFor(status: number): FillErrorReason {
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

export type FillHandlers = {
  /** Charged; the model thinks before the first answer */
  onStart: (charge: { credits: number; credit_balance: number }) => void;
  /** The next piece of a text answer */
  onDelta: (delta: { id: string; text: string }) => void;
  /** A field's final, already checked answer */
  onAnswer: (answer: FormAnswer) => void;
};

// The API pings every 15 s while the model thinks: this much silence means
// the connection is gone
const idleTimeoutMs = 45_000;

/**
 * Fills at exactly the quoted price, as a stream (POST /forms/fill with
 * `Accept: text/event-stream`): answers arrive field by field. Resolves with
 * the `done` body; rejects with FillError. `signal` only stops reading: the
 * API finishes (and has charged) the fill once it started
 */
export async function streamFill(
  token: string,
  form: ScannedForm,
  context: string,
  choices: FillChoices,
  expectedCredits: number,
  handlers: FillHandlers,
  signal: AbortSignal,
): Promise<FillResult> {
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
      response = await api("/forms/fill", {
        method: "POST",
        token,
        accept: "text/event-stream",
        body: {
          ...fillBody(form, context, choices),
          expected_credits: expectedCredits,
        },
        signal: AbortSignal.any([signal, idle.signal]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      if (idle.signal.aborted) throw new FillError("timeout");
      if (error instanceof ApiUnreachableError) throw new FillError("offline");
      throw error;
    }

    // 400/401/402/409/503 come before the stream, as plain JSON: nothing charged
    if (response.status === 401) {
      await dropSession();
      throw new FillError("unauthorized");
    }
    if (!response.ok || !response.body) {
      const failure: { error?: string; credits?: number; balance?: number } =
        await response.json().catch(() => ({}));
      throw new FillError(
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
            handlers.onStart(JSON.parse(data));
            break;
          case "delta":
            handlers.onDelta(JSON.parse(data));
            break;
          case "answer":
            handlers.onAnswer(JSON.parse(data));
            break;
          case "done":
            return JSON.parse(data) as FillResult;
          case "error": {
            const failure = JSON.parse(data) as {
              error: string;
              refunded?: boolean;
            };
            const refunded = failure.refunded !== false;
            throw new FillError(
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
      if (error instanceof FillError || signal.aborted) throw error;
      throw new FillError("interrupted");
    }
    throw new FillError("interrupted");
  } finally {
    clearTimeout(timer);
  }
}

/** Charged at exactly the quoted price; rejects with FillError */
export async function fillWithAi(
  token: string,
  form: ScannedForm,
  context: string,
  choices: FillChoices,
  expectedCredits: number,
): Promise<FillResult> {
  try {
    return await request<FillResult>("/forms/fill", {
      method: "POST",
      token,
      body: {
        ...fillBody(form, context, choices),
        expected_credits: expectedCredits,
      },
    });
  } catch (error) {
    if (error instanceof ApiUnreachableError) throw new FillError("offline");
    if (error instanceof UnauthorizedError) throw new FillError("unauthorized");
    if (error instanceof ApiError) {
      const { credits, balance } = error.body;
      throw new FillError(
        reasonFor(error.status),
        credits === undefined ? undefined : { price: credits, balance },
        error.body.error,
      );
    }
    throw error;
  }
}
