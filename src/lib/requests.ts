// Authenticated calls to ai-summarizer-api, shared by summaries and credits
import { api } from "./api";
import { dropSession } from "./auth";

/** Cursor-paginated lists (GET /summaries, GET /credits/transactions) */
export type Page<T> = {
  items: T[];
  /** null on the last page */
  next_cursor: string | null;
};

type ErrorBody = { error?: string; credits?: number; balance?: number };

/** A non-2xx answer other than 401 (which signs the user out) */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The JSON body: `error`, plus `credits`/`balance` on 402 and 409 */
    readonly body: ErrorBody,
  ) {
    super(body.error ?? `HTTP ${status}`);
  }
}

/** The session expired or was revoked; it's already been dropped */
export class UnauthorizedError extends Error {}

export async function request<T>(
  path: string,
  options: Parameters<typeof api>[1] & { token: string },
): Promise<T> {
  const response = await api(path, options);
  if (response.status === 401) {
    await dropSession();
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    const body: ErrorBody = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function pageQuery(cursor: string | null) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return query;
}
