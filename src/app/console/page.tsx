"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SimulationBanner } from "@/components/SimulationBanner";
import { SignalCard, type QueueSignal } from "@/components/SignalCard";
import { ReportCard, type QueueReport } from "@/components/ReportCard";
import { useCopy } from "@/lib/i18n/context";

type Tab = "sos" | "reports";

/**
 * The moderator's desk, in two queues.
 *
 * It held one until the system was reviewed and a dashboard for monitoring
 * submitted reports was asked for. The two are tabs on one screen rather than
 * two routes because they are one person's job, and because the counts have to
 * be visible together: a moderator who can see nine reports waiting while they
 * work an SOS is making a different decision about their next ten minutes than
 * one who has to go looking.
 *
 * SOS stays the default tab. Depth reports are a backlog and rescue requests
 * are not, and the screen should open on the one where waiting costs most.
 */
export default function ConsolePage() {
  const copy = useCopy();
  const [tab, setTab] = useState<Tab>("sos");
  const [signals, setSignals] = useState<QueueSignal[] | null>(null);
  const [reports, setReports] = useState<QueueReport[] | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();

    // Both queues, whichever tab is showing. Loading only the visible one would
    // leave the other tab's count blank until it was opened, which is exactly
    // the information the tabs exist to carry.
    const [signalRows, reportRows] = await Promise.all([
      supabase.rpc("moderator_queue"),
      supabase.rpc("report_queue"),
    ]);

    setSignals((signalRows.data as QueueSignal[]) ?? []);
    setReports((reportRows.data as QueueReport[]) ?? []);
  }, []);

  useEffect(() => {
    void load();

    // A signal should appear the moment it is sent, without a refresh. This is
    // the honest version of "notify the rescuers": it reaches this screen, and
    // nothing outside the application. 0027 puts depth_reports on the same
    // publication, so a filed report arrives the same way.
    const channel = createClient()
      .channel("console-queues")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_signals" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "depth_reports" },
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

        <div className="console-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "sos"}
            className="console-tab"
            data-active={tab === "sos"}
            onClick={() => setTab("sos")}
          >
            {copy.screens.tabSos}
            {signals !== null && signals.length > 0 && (
              <span className="console-tab-count">{signals.length}</span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={tab === "reports"}
            className="console-tab"
            data-active={tab === "reports"}
            onClick={() => setTab("reports")}
          >
            {copy.screens.tabReports}
            {reports !== null && reports.length > 0 && (
              <span className="console-tab-count">{reports.length}</span>
            )}
          </button>
        </div>

        {tab === "sos" && (
          <>
            {signals === null && (
              <p className="task-lede">{copy.screens.consoleLoading}</p>
            )}

            {signals !== null && signals.length === 0 && (
              <p className="task-lede">{copy.screens.consoleEmpty}</p>
            )}

            {signals?.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </>
        )}

        {tab === "reports" && (
          <>
            {reports === null && (
              <p className="task-lede">{copy.screens.consoleLoading}</p>
            )}

            {reports !== null && reports.length === 0 && (
              <p className="task-lede">{copy.screens.reportsEmpty}</p>
            )}

            {reports?.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                // A decided report leaves the queue. Reloading rather than
                // splicing it out locally keeps one source of truth for the
                // ordering: the priority bands are computed against `now()` in
                // SQL, so a list edited on the client would slowly stop
                // matching the rule that sorted it.
                onDecided={() => void load()}
              />
            ))}
          </>
        )}
      </main>
    </>
  );
}
