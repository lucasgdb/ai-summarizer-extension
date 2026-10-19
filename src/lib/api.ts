// ai-summarizer-api (../ai-summarizer-api): summaries, credits
export const apiUrl = import.meta.env.WXT_API_URL ?? "http://localhost:8080";

// lb-auth-api (../lb-auth-api): sign-in, sessions and the user, shared by
// every lb-platform app. Answers this extension through CORS
export const authApiUrl =
  import.meta.env.WXT_AUTH_API_URL ?? "http://localhost:8081";

/** An API couldn't be reached at all (down, offline, wrong URL) */
export class ApiUnreachableError extends Error {
  constructor(readonly url: string = apiUrl) {
    super(`Can't reach ${url}`);
  }
}

export async function api(
  path: string,
  {
    method = "GET",
    body,
    token,
    signal,
    accept,
    base = apiUrl,
  }: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    token?: string;
    signal?: AbortSignal;
    /** e.g. "text/event-stream" */
    accept?: string;
    /** authApiUrl for lb-auth-api; ai-summarizer-api otherwise */
    base?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accept) headers.Accept = accept;

  try {
    return await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiUnreachableError(base);
  }
}
