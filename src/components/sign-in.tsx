import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authApiUrl } from "@/lib/api";
import { AuthError, type AuthErrorReason, signInWithGoogle } from "@/lib/auth";
import { useUiMode } from "@/lib/ui-mode-context";
import { useDictionary } from "@/lib/use-locale";
import { GoogleIcon } from "./google-icon";

export function SignIn() {
  const dict = useDictionary();
  const mode = useUiMode();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthErrorReason | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      // On success the session store re-renders the app signed in
      await signInWithGoogle(mode);
    } catch (error) {
      console.error(error);
      setError(error instanceof AuthError ? error.reason : "failed");
    } finally {
      setPending(false);
    }
  }

  const message = error && dict.signIn.errors[error];

  return (
    <section className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="title mb-2 text-2xl font-semibold tracking-tighter">
        {dict.heroTitle}
      </h1>
      <p className="mb-8 text-muted-foreground">{dict.signIn.body}</p>
      <Button
        variant="outline"
        size="lg"
        className="h-10 gap-2.5 px-4"
        disabled={pending}
        onClick={signIn}
      >
        {pending ? (
          <Spinner aria-label={dict.loading} />
        ) : (
          <GoogleIcon className="size-4" />
        )}
        {dict.signIn.google}
      </Button>
      {message && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {typeof message === "function" ? message(authApiUrl) : message}
        </p>
      )}
    </section>
  );
}
