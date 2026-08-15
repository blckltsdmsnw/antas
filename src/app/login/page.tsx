"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCopy } from "@/lib/i18n/context";
import type { Copy } from "@/lib/i18n/strings";

type SubmitStatus = "idle" | "sending" | "sent";

const LINK_ERROR_KEY: Record<string, keyof Copy["screens"]> = {
  expired_link: "loginExpired",
  missing_code: "loginNoCode",
};

function LinkErrorAlert() {
  const copy = useCopy();
  const searchParams = useSearchParams();
  const key = LINK_ERROR_KEY[searchParams.get("error") ?? ""];
  const message = key ? (copy.screens[key] as string) : null;

  if (!message) return null;
  return (
    <p className="alert" role="alert" style={{ marginBottom: 20, marginTop: 0 }}>
      {message}
    </p>
  );
}

export default function LoginPage() {
  const copy = useCopy();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("sending");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    });

    if (signInError) {
      // No logger utility in this project yet — wire to real telemetry
      // (e.g. Sentry) later. Keep the user-facing message generic; the
      // real error goes to the console/ops for now.
      console.error("signInWithOtp failed:", signInError);
      setError(copy.screens.loginFailed);
      setStatus("idle");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <main className="task-page">
        <div className="done">
          <h1 className="done-title">{copy.screens.loginCheckTitle}</h1>
          <p className="done-body">{copy.screens.loginCheckBody}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="task-page">
      <h1 className="task-title">{copy.screens.loginTitle}</h1>
      <p className="task-lede">{copy.screens.loginLede}</p>

      <form onSubmit={handleSubmit}>
        <Suspense fallback={null}>
          <LinkErrorAlert />
        </Suspense>

        <label className="field">
          <span className="field-label" id="email-label">
            {copy.screens.loginEmail}
          </span>
          <input
            id="email"
            className="field-input"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder={copy.screens.loginEmailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <button className="btn" type="submit" disabled={status === "sending"}>
          {status === "sending" ? copy.screens.loginSending : copy.screens.loginSend}
        </button>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
