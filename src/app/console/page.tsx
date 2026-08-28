"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SimulationBanner } from "@/components/SimulationBanner";
import { SignalCard, type QueueSignal } from "@/components/SignalCard";
import { ReportCard, type QueueReport } from "@/components/ReportCard";
import { AssignmentCard, type MyAssignment } from "@/components/AssignmentCard";
import { useCopy } from "@/lib/i18n/context";

type Tab = "sos" | "reports" | "assigned";

/** One row of `console_access()`: what this account may see here. */
export interface ConsoleAccess {
  role: "moderator" | "admin" | "master_admin" | null;
  open_assignments: number;
}

/**
 * The desk, in up to three tabs.
 *
 * It held two - SOS and depth reports, a moderator's job - until responders
 * arrived. A responder is not a moderator: they hold no barangay queue, only
 * whatever `assign_responder` put on them, so the screen now has to ask
 * `console_access()` what this account actually is before it knows what to
 * show at all. `undefined` is "not asked yet" and `null` is "signed out" -
 * two different silences that read as two different messages below.
 *
 * SOS stays the default tab for anyone with a queue. Depth reports are a
 * backlog and rescue requests are not, and the screen should open on the one
 * where waiting costs most. A responder with no queue of their own lands on
 * their own list instead, once, the first time access is known - see `landed`.
 */
export default function ConsolePage() {
  const copy = useCopy();
  const [tab, setTab] = useState<Tab>("sos");
  const [access, setAccess] = useState<ConsoleAccess | null | undefined>(undefined);
  const [signals, setSignals] = useState<QueueSignal[] | null>(null);
  const [reports, setReports] = useState<QueueReport[] | null>(null);
  const [assignments, setAssignments] = useState<MyAssignment[] | null>(null);

  // Whether the first load has completed. Guards the one-time tab jump below
  // so a realtime reload later never yanks a responder off a tab they chose.
  const landed = useRef(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const firstLoad = !landed.current;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      landed.current = true;
      setAccess(null);
      return;
    }

    const { data } = await supabase.rpc("console_access");
    const row = ((data as ConsoleAccess[]) ?? [])[0] ?? { role: null, open_assignments: 0 };
    setAccess(row);

    // A user with neither a role nor an open assignment makes exactly one
    // RPC: there is nothing else here for them to see.
    const [signalRows, reportRows, assignmentRows] = await Promise.all([
      row.role !== null
        ? supabase.rpc("moderator_queue")
        : Promise.resolve({ data: [] as QueueSignal[] }),
      row.role !== null
        ? supabase.rpc("report_queue")
        : Promise.resolve({ data: [] as QueueReport[] }),
      row.open_assignments > 0
        ? supabase.rpc("my_assignments")
        : Promise.resolve({ data: [] as MyAssignment[] }),
    ]);

    setSignals((signalRows.data as QueueSignal[]) ?? []);
    setReports((reportRows.data as QueueReport[]) ?? []);
    setAssignments((assignmentRows.data as MyAssignment[]) ?? []);

    if (firstLoad) {
      landed.current = true;
      // A responder with no barangay role has no other tab worth opening on.
      if (row.role === null && row.open_assignments > 0) setTab("assigned");
    }
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

        {access === undefined && (
          <p className="task-lede">{copy.screens.consoleLoading}</p>
        )}

        {access === null && (
          <>
            <p className="task-lede">{copy.screens.akoSignedOut}</p>
            <Link href="/login" className="btn">
              {copy.screens.loginTitle}
            </Link>
          </>
        )}

        {access !== undefined &&
          access !== null &&
          access.role === null &&
          access.open_assignments === 0 && (
            <p className="task-lede">{copy.board.consoleNoAccess}</p>
          )}

        {access !== undefined &&
          access !== null &&
          (access.role !== null || access.open_assignments > 0) && (
            <>
              {access.role === "master_admin" && (
                <Link href="/console/board" className="btn btn-quiet console-board-link">
                  {copy.board.openBoard}
                </Link>
              )}

              <div className="console-tabs" role="tablist">
                {access.role !== null && (
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
                )}
                {access.role !== null && (
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
                )}
                {access.open_assignments > 0 && (
                  <button
                    role="tab"
                    aria-selected={tab === "assigned"}
                    className="console-tab"
                    data-active={tab === "assigned"}
                    onClick={() => setTab("assigned")}
                  >
                    {copy.board.tabAssigned}
                    {assignments !== null && assignments.length > 0 && (
                      <span className="console-tab-count">{assignments.length}</span>
                    )}
                  </button>
                )}
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

              {tab === "assigned" && (
                <>
                  {assignments === null && (
                    <p className="task-lede">{copy.screens.consoleLoading}</p>
                  )}

                  {assignments !== null && assignments.length === 0 && (
                    <p className="task-lede">{copy.board.assignedEmpty}</p>
                  )}

                  {assignments?.map((a) => (
                    <AssignmentCard
                      key={a.assignment_id}
                      assignment={a}
                      onClosed={() => void load()}
                    />
                  ))}
                </>
              )}
            </>
          )}
      </main>
    </>
  );
}
