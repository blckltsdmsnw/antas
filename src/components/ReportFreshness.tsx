"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitUpdate } from "@/app/actions/submit-update";
import {
  REPORT_STATES,
  STATE_LABEL_KEY,
  STATE_SUMMARY_KEY,
  leadingUpdate,
  totalVotes,
  type UpdateTally,
} from "@/lib/reports/update";
import { relativeTime } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

/**
 * "Kumusta na?" - the honest version of a comment thread.
 *
 * The question under an ageing pin is always the same: is the water still
 * there. People would ask it in words - "mataas pa rin po ba" - and answer it
 * in words - "wala na po as of now". Three buttons carry exactly that, and
 * carry it better: nothing to moderate on an application nobody watches, no way
 * for prose to say "wala na" beneath water that is still chest-deep, and a
 * countable answer rather than one buried in a thread.
 *
 * It is also what a reporter gets back. Filing a report used to be something
 * you did into silence; now somebody answers it.
 */

interface ReportFreshnessProps {
  reportId: string;
}

type Stage = "loading" | "ready" | "sending" | "signed-out" | "failed";

export function ReportFreshness({ reportId }: ReportFreshnessProps) {
  const copy = useCopy();
  const [tallies, setTallies] = useState<UpdateTally[]>([]);
  const [stage, setStage] = useState<Stage>("loading");
  const [mine, setMine] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("report_update_summary", {
      report_id: reportId,
    });

    // Same rule as the map: a failed read is not an empty one. Showing "walang
    // update" when we simply could not ask would be inventing silence.
    if (error) {
      setStage("failed");
      return;
    }

    setTallies((data ?? []) as UpdateTally[]);
    setStage("ready");
  }, [reportId]);

  useEffect(() => {
    setMine(null);
    void load();
  }, [load]);

  async function answer(state: string) {
    setStage("sending");
    const result = await submitUpdate(reportId, state);

    if (!result.ok) {
      setStage(result.error === "not_signed_in" ? "signed-out" : "failed");
      return;
    }

    setMine(state);
    await load();
  }

  const leading = leadingUpdate(tallies);
  const total = totalVotes(tallies);

  return (
    <section className="fresh" aria-label={copy.screens.freshLabel}>
      <p className="fresh-title">{copy.screens.freshTitle}</p>

      {stage === "failed" && (
        <p className="fresh-note">{copy.screens.freshFailed}</p>
      )}

      {stage === "signed-out" && (
        <p className="fresh-note">{copy.screens.freshSignIn}</p>
      )}

      {leading && (
        // The most recent word leads, not the most numerous - water moves, and
        // an older consensus is only describing an earlier moment.
        <p className="fresh-lead" data-state={leading.state}>
          <strong>{copy.screens[STATE_SUMMARY_KEY[leading.state]] as string}</strong>
          <span className="fresh-when">
            {relativeTime(leading.latest, copy.screens)}
            {total > 1 ? ` · ${copy.screens.freshAnswers(total)}` : ""}
          </span>
        </p>
      )}

      <div className="fresh-buttons">
        {REPORT_STATES.map((state) => (
          <button
            key={state}
            type="button"
            className="fresh-button"
            data-state={state}
            data-mine={mine === state}
            disabled={stage === "sending"}
            onClick={() => void answer(state)}
          >
            {copy.screens[STATE_LABEL_KEY[state]] as string}
          </button>
        ))}
      </div>

      {mine && <p className="fresh-note">{copy.screens.freshThanks}</p>}
    </section>
  );
}
