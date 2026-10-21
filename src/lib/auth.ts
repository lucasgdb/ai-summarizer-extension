import { browser, storage } from "#imports";
import { ApiUnreachableError, api, authApiUrl } from "./api";
import type { BackgroundRequest } from "./messages";
import type { UiMode } from "./ui-mode";

// Web application OAuth client whose redirect URIs include
// browser.identity.getRedirectURL() (https://<extension-id>.chromiumapp.org/)
const googleClientId = import.meta.env.WXT_GOOGLE_CLIENT_ID ?? "";

/** This extension's app in lb-auth-api (auth.apps) */
const app = "ai-summarizer";

/** lb-auth-api's user: the same id in every lb-platform app */
export type User = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  /** Not from lb-auth-api: the balance is the credits query (GET /credits) */
  credit_balance?: number;
};

export type Session = {
  token: string;
  /** Epoch ms */
  expiresAt: number;
  user: User;
};

export const sessionItem = storage.defineItem<Session | null>("local:session", {
  fallback: null,
});

export function parseSession(session: Session | null) {
  return session && session.expiresAt > Date.now() ? session : null;
}

export type AuthErrorReason =
  | "not-configured" // no client id here, or 503 from the API
  | "rejected" // 401: the API didn't accept the Google token
  | "offline"
  // 409: the email belongs to another account, and Google doesn't vouch that
  // it's the same owner (an email outside Gmail and Workspace)
  | "email-linked"
  | "failed";

export class AuthError extends Error {
  constructor(
    readonly reason: AuthErrorReason,
    message?: string,
  ) {
    super(message ?? reason);
  }
}

type SessionResponse = {
  access_token: string;
  expires_in: number;
  new_user: boolean;
  user: User;
};

function googleAuthUrl(nonce: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: browser.identity.getRedirectURL(),
    // An ID token straight from Google: the API verifies it, no client secret
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/**
 * Opens Google's account chooser in its own window and trades the ID token
 * for an API session. Run by the side panel, or by the background for the
 * popup (which that window closes). Resolves with null when the user closes
 * the window.
 */
export async function googleSignInFlow(): Promise<Session | null> {
  if (!googleClientId) {
    throw new AuthError("not-configured", "WXT_GOOGLE_CLIENT_ID is not set");
  }

  // Must match the token's nonce claim, so a token from another flow can't be replayed
  const nonce = crypto.randomUUID();
  let redirect: string | undefined;
  try {
    redirect = await browser.identity.launchWebAuthFlow({
      url: googleAuthUrl(nonce),
      interactive: true,
    });
  } catch {
    // Closed the popup or declined: nothing to report
    return null;
  }

  // The token comes back in the fragment: #id_token=...&...
  const params = new URLSearchParams(new URL(redirect ?? "").hash.slice(1));
  const idToken = params.get("id_token");
  if (!idToken) {
    throw new AuthError("failed", params.get("error") ?? "no id_token");
  }

  let response: Response;
  try {
    response = await api("/auth/google", {
      method: "POST",
      body: { id_token: idToken, nonce, app },
      base: authApiUrl,
    });
  } catch (error) {
    if (error instanceof ApiUnreachableError) throw new AuthError("offline");
    throw error;
  }

  if (!response.ok) {
    const reason =
      response.status === 401
        ? "rejected"
        : response.status === 409
          ? "email-linked"
          : response.status === 503
            ? "not-configured"
            : "failed";
    const body: { error?: string } = await response.json().catch(() => ({}));
    throw new AuthError(reason, body.error);
  }

  const body: SessionResponse = await response.json();
  const session: Session = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    user: body.user,
  };
  await sessionItem.setValue(session);
  return session;
}

/** The background's sign-in, as it goes (storage.session: extension pages only) */
export type SignInState =
  | { status: "pending"; attempt: string }
  | { status: "done"; attempt: string; signedIn: boolean }
  | { status: "error"; attempt: string; reason: AuthErrorReason };

export const signInStateItem = storage.defineItem<SignInState | null>(
  "session:sign-in",
  { fallback: null },
);

/**
 * Signs in with Google. The side panel runs the flow itself, right in the
 * click, so Google's window opens in front. The popup closes as soon as that
 * window opens, so it hands the flow to the background and waits for this
 * attempt's outcome in storage. Either way the session lands in storage, so
 * every open panel (and the popup, reopened) is signed in by itself.
 * Resolves false when the user closed Google's window
 */
export async function signInWithGoogle(mode: UiMode): Promise<boolean> {
  if (mode === "sidepanel") return (await googleSignInFlow()) !== null;

  const attempt = crypto.randomUUID();
  let unwatch = () => {};
  const outcome = new Promise<SignInState>((resolve) => {
    unwatch = signInStateItem.watch((state) => {
      if (state?.attempt === attempt && state.status !== "pending") {
        resolve(state);
      }
    });
  });
  try {
    await browser.runtime.sendMessage({
      type: "sign-in",
      attempt,
    } satisfies BackgroundRequest);
    const state = await outcome;
    if (state.status === "error") throw new AuthError(state.reason);
    return state.status === "done" && state.signedIn;
  } finally {
    unwatch();
  }
}

/** Ends the session on the API too; the local copy goes even if that fails */
export async function signOut(session: Session) {
  await sessionItem.setValue(null);
  try {
    await api("/auth/logout", {
      method: "POST",
      token: session.token,
      base: authApiUrl,
    });
  } catch {}
}

/**
 * Ends every session of the account on the API, this one included. The local
 * copy goes only once the API confirms (or no longer knows the session): a
 * failure here must not look like it worked on the other devices
 */
export async function signOutEverywhere(session: Session) {
  const response = await api("/auth/logout-all", {
    method: "POST",
    token: session.token,
    base: authApiUrl,
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(`logout-all: HTTP ${response.status}`);
  }
  await sessionItem.setValue(null);
}

/** Refreshes the user (name, picture) and drops sessions the API revoked */
export async function refreshUser(session: Session) {
  let response: Response;
  try {
    response = await api("/me", { token: session.token, base: authApiUrl });
  } catch {
    return; // Offline: keep the session, summaries will say so
  }
  if (response.status === 401) {
    await sessionItem.setValue(null);
    return;
  }
  if (response.ok) {
    const user: User = await response.json();
    await sessionItem.setValue({
      ...session,
      user: { ...user, credit_balance: session.user.credit_balance },
    });
  }
}

/** Forgets a session the API no longer accepts */
export function dropSession() {
  return sessionItem.setValue(null);
}
