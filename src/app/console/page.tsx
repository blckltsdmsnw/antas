"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SimulationBanner } from "@/components/SimulationBanner";
import { SignalCard, type QueueSignal } from "@/components/SignalCard";
import { useCopy } from "@/lib/i18n/context";

export default function ConsolePage() {
  const copy = useCopy();
  const [signals, setSignals] = useState<QueueSignal[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("moderator_queue");
    setSignals((data as QueueSignal[]) ?? []);
  }, []);

  useEffect(() => {
    void load();

    // A signal should appear the moment it is sent, without a refresh. This is
    // the honest version of "notify the rescuers": it reaches this screen, and
    // nothing outside the application.
    const channel = createClient()
      .channel("sos-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_signals" },
        () => void load(),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [load]);

  return (
    <>
      <SimulationBanner />
      <main className="console-page">
        <h1 className="task-title">{copy.screens.consoleTitle}</h1>

        {signals === null && (
          <p className="task-lede">{copy.screens.consoleLoading}</p>
        )}

        {signals !== null && signals.length === 0 && (
          <p className="task-lede">{copy.screens.consoleEmpty}</p>
        )}

        {signals?.map((signal) => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </main>
    </>
  );
}
