"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SubmitStatus = "idle" | "sending" | "sent";

const LINK_ERROR_MESSAGES: Record<string, string> = {
  expired_link: "Paso na ang link o nagamit na. Humingi ng bago.",
  missing_code: "Walang code sa link. Humingi ng bago.",
};

function LinkErrorAlert() {
  const searchParams = useSearchParams();
  const message = LINK_ERROR_MESSAGES[searchParams.get("error") ?? ""];

  if (!message) return null;
  return (
    <p className="alert" role="alert" style={{ marginBottom: 20, marginTop: 0 }}>
      {message}
    </p>
  );
}

export default function LoginPage() {
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
      setError("Hindi naipadala ang link. Subukan ulit.");
      setStatus("idle");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <main className="task-page">
        <div className="done">
          <h1 className="done-title">Tingnan ang email mo</h1>
          <p className="done-body">Check your email for the sign-in link.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="task-page">
      <h1 className="task-title">Mag-sign in</h1>
      <p className="task-lede">
        Kailangan lang ito bago mag-report. Hindi kailangan para tingnan ang mapa.
      </p>

      <form onSubmit={handleSubmit}>
        <Suspense fallback={null}>
          <LinkErrorAlert />
        </Suspense>

        <label className="field">
          <span className="field-label" id="email-label">
            Email
          </span>
          <input
            id="email"
            className="field-input"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="ikaw@halimbawa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <button className="btn" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Ipinapadala..." : "Send sign-in link"}
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
