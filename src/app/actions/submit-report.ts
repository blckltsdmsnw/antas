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

/** Validation codes plus the two failures only the action can detect. */
export type SubmitErrorCode =
  | ReportErrorCode
  | "not_signed_in"
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
    .insert(buildReportRow(userData.user.id, input));

  if (error) {
    return { ok: false, errors: ["insert_failed"] };
  }

  revalidatePath("/");
  return { ok: true, warnings: validation.warnings };
}
