// ai-summarizer-api (../ai-summarizer-api)
export const apiUrl = import.meta.env.WXT_API_URL ?? "http://localhost:8080";

/** The API couldn't be reached at all (down, offline, wrong WXT_API_URL) */
export class ApiUnreachableError extends Error {
  constructor() {
    super(`Can't reach ${apiUrl}`);
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
  }: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    token?: string;
    signal?: AbortSignal;
    /** e.g. "text/event-stream" */
    accept?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accept) headers.Accept = accept;

  try {
    return await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiUnreachableError();
  }
}
