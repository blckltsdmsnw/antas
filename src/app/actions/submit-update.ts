"use server";

import { createClient } from "@/lib/supabase/server";
import { isReportState, type ReportState } from "@/lib/reports/update";

/**
 * Answering "kumusta na?" on somebody's report, and hiding your own.
 *
 * Both go through a server action for the same reason report submission does:
 * the identity comes from the session, never from the request body. The
 * database enforces it too - `with check (reporter_id = auth.uid())` on the
 * insert, and a column-scoped grant plus a one-value policy on the hide - so
 * this is the outer of two barriers rather than the only one.
 */

export type UpdateErrorCode =
  | "not_signed_in"
  | "invalid_state"
  | "write_failed"
  | "not_your_report";

export type UpdateResult = { ok: true } | { ok: false; error: UpdateErrorCode };

export async function submitUpdate(
  reportId: string,
  state: string,
): Promise<UpdateResult> {
  if (!isReportState(state)) return { ok: false, error: "invalid_state" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "not_signed_in" };

  // Through a function, not the table. `report_updates` grants nothing to
  // anon or authenticated, because rows there record who was standing where -
  // and a PostgREST upsert needs SELECT on the table to resolve its conflict
  // target, so letting people answer would have meant letting them read who
  // else had. Note there is no reporter_id to pass: the function writes
  // auth.uid() and nothing else, so there is nothing here to forge.
  const { error } = await supabase.rpc("submit_report_update", {
    p_report_id: reportId,
    p_state: state as ReportState,
  });

  return error ? { ok: false, error: "write_failed" } : { ok: true };
}

/**
 * Hidden, never deleted.
 *
 * The row stays: it is evidence that somebody reported something, and rewriting
 * that is not ours to do. The public read policy filters on `status = 'active'`,
 * so hiding is all it takes to leave the map - which is what "remove" means to
 * the person asking for it.
 */
export async function hideReport(reportId: string): Promise<UpdateResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "not_signed_in" };

  const { error, count } = await supabase
    .from("depth_reports")
    .update({ status: "hidden" }, { count: "exact" })
    .eq("id", reportId)
    .eq("reporter_id", auth.user.id);

  if (error) return { ok: false, error: "write_failed" };

  // Zero rows means the report was not theirs. Row-level security already
  // refused it silently; this turns that silence into a sentence the interface
  // can show, rather than a button that appears to do nothing.
  if (count === 0) return { ok: false, error: "not_your_report" };

  return { ok: true };
}
