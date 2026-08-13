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
  return <p role="alert">{message}</p>;
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
    return <p>Check your email for the sign-in link.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <Suspense fallback={null}>
        <LinkErrorAlert />
      </Suspense>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit" disabled={status === "sending"}>
        Send sign-in link
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
