"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isHideReason, type HideReason } from "@/lib/reports/decision";

/**
 * A code, not a sentence - the same rule `decide-sos.ts` states. A server
 * action has no business holding user-facing prose once the product carries
 * two languages: it would have to resolve the reader's language itself, and
 * every caller would be stuck with whatever it chose.
 */
export type DecideReportError = "no_reason" | "failed";

export type DecideReportResult =
  | { ok: true }
  | { ok: false; code: DecideReportError };

/**
 * Thin wrapper. Every rule - barangay scope, the report existing, a reason
 * being required to hide, and whether confirming is allowed, and the audit
 * row - lives in the `decide_report` Postgres function so the whole decision
 * is one transaction. Re-implementing any of it here would create a second
 * source of truth that drifts.
 */
export async function decideReport(
  reportId: string,
  decision: "keep" | "hide" | "confirm",
  reason: string | null,
): Promise<DecideReportResult> {
  if (decision === "hide" && (reason === null || !isHideReason(reason))) {
    return { ok: false, code: "no_reason" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_report", {
    p_report_id: reportId,
    p_decision: decision,
    p_reason: (reason as HideReason | null) ?? null,
  });

  if (error) {
    // TODO: replace with real telemetry once a logger exists.
    console.error("decide_report failed", {
      reportId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, code: "failed" };
  }

  // Both surfaces move: the console loses the row, and the map gains or loses
  // the pin. Revalidating only the console would leave a hidden report still
  // drawn on the map for whoever had it open.
  revalidatePath("/console");
  revalidatePath("/");
  return { ok: true };
}
