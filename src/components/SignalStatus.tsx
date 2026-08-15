"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSosStatus, type SosStatus } from "@/lib/sos/status";
import { progressText } from "@/lib/sos/progress";
import { useCopy } from "@/lib/i18n/context";

/**
 * What happened to the signal you just sent.
 *
 * Sending used to be the end of it: "Naipadala na" and then silence, for ever.
 * That is the same gap "kumusta na" closed on depth reports, and it matters
 * more here - the person waiting for an answer may be in the water.
 *
 * It reports only things that have ALREADY HAPPENED. A moderator opening the
 * signal moves it to `under_review`, which is a real act and already audited.
 * Nothing here says help is coming, because nothing sends help; the wording
 * lives in lib/sos/progress.ts, where it is kept and tested on its own.
 *
 * Live over realtime rather than polled: `sos_signals` has been in the
 * `supabase_realtime` publication since 0010, and row-level security applies to
 * a subscription exactly as it does to a query - so this can only ever receive
 * the sender's own row.
 */

interface SignalStatusProps {
  signalId: string;
}

export function SignalStatus({ signalId }: SignalStatusProps) {
  const copy = useCopy();
  const [status, setStatus] = useState<SosStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let live = true;

    void supabase
      .from("sos_signals")
      .select("status")
      .eq("id", signalId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        // A failed read is not "nothing has happened". Saying so would invent
        // silence, which on this screen is the most misleading thing available.
        if (error) setFailed(true);
        else if (data && isSosStatus(data.status)) setStatus(data.status);
      });

    const channel = supabase
      .channel(`sos-${signalId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sos_signals",
          filter: `id=eq.${signalId}`,
        },
        (payload) => {
          const next = (payload.new as { status?: string }).status;
          if (live && next && isSosStatus(next)) setStatus(next);
        },
      )
      .subscribe();

    return () => {
      live = false;
      void supabase.removeChannel(channel);
    };
  }, [signalId]);

  if (failed) {
    return <p className="progress-note">{copy.sos.statusUnavailable}</p>;
  }

  if (!status) return null;

  const progress = progressText(status, copy.sos);

  return (
    <section className="progress" data-status={status} aria-live="polite">
      <p className="progress-headline">{progress.headline}</p>
      <p className="progress-detail">{progress.detail}</p>
    </section>
  );
}
