"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validateReport,
  type ReportInput,
  type ReportErrorCode,
  type ReportWarningCode,
} from "@/lib/reports/validate";
import { buildReportRow } from "@/lib/reports/row";

/** Validation codes plus the failures only the action can detect. */
export type SubmitErrorCode =
  | ReportErrorCode
  | "not_signed_in"
  | "suspended"
  | "insert_failed";

export type SubmitResult =
  | { ok: true; warnings: ReportWarningCode[] }
  | { ok: false; errors: SubmitErrorCode[] };

export async function submitReport(input: ReportInput): Promise<SubmitResult> {
  const validation = validateReport(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, errors: ["not_signed_in"] };
  }

  const { error } = await supabase
    .from("depth_reports")
    .insert(buildReportRow(userData.user.id, { ...input, depth: validation.depth }));

  if (error) {
    /**
     * A suspended reporter is refused by row-level security, and would
     * otherwise be told "may problema sa pagpapadala" - which reads as a
     * transient glitch and invites them to retry forever. A refusal somebody
     * cannot explain is the silent failure this codebase keeps having to fix.
     *
     * Asked directly rather than inferred from the Postgres error code, which
     * would also match unrelated permission problems. One extra round trip, on
     * the failure path only.
     */
    const { data: suspended } = await supabase.rpc("is_suspended");
    if (suspended === true) {
      return { ok: false, errors: ["suspended"] };
    }

    // TODO: replace with real telemetry once a logger exists.
    console.error("depth_reports insert failed", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return { ok: false, errors: ["insert_failed"] };
  }

  revalidatePath("/");
  return { ok: true, warnings: validation.warnings };
}
