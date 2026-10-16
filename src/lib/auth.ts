import { browser, storage } from "#imports";
import { ApiUnreachableError, api } from "./api";

// Web application OAuth client whose redirect URIs include
// browser.identity.getRedirectURL() (https://<extension-id>.chromiumapp.org/)
const googleClientId = import.meta.env.WXT_GOOGLE_CLIENT_ID ?? "";

export type User = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  /** From GET /me; the live value is the credits query */
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
 * Opens Google's account chooser in a popup and trades the ID token for an API
 * session. Resolves with null when the user closes the popup.
 */
export async function signInWithGoogle(): Promise<Session | null> {
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
      body: { id_token: idToken, nonce },
    });
  } catch (error) {
    if (error instanceof ApiUnreachableError) throw new AuthError("offline");
    throw error;
  }

  if (!response.ok) {
    const reason =
      response.status === 401
        ? "rejected"
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

/** Ends the session on the API too; the local copy goes even if that fails */
export async function signOut(session: Session) {
  await sessionItem.setValue(null);
  try {
    await api("/auth/logout", { method: "POST", token: session.token });
  } catch {}
}

/** Refreshes the user (name, picture) and drops sessions the API revoked */
export async function refreshUser(session: Session) {
  let response: Response;
  try {
    response = await api("/me", { token: session.token });
  } catch {
    return; // Offline: keep the session, summaries will say so
  }
  if (response.status === 401) {
    await sessionItem.setValue(null);
    return;
  }
  if (response.ok) {
    const user: User = await response.json();
    await sessionItem.setValue({ ...session, user });
  }
}

/** Forgets a session the API no longer accepts */
export function dropSession() {
  return sessionItem.setValue(null);
}
