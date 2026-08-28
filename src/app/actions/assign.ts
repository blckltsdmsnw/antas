"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BoardKind } from "@/lib/board/types";

/**
 * A code, not a sentence - the rule every action here follows. The board
 * maps `not_allowed` and `failed` onto `copy.board`.
 */
export type AssignError = "not_allowed" | "failed";

export type AssignResult =
  | { ok: true; assignmentId: string | null }
  | { ok: false; code: AssignError };

/** Postgres's insufficient_privilege, which 0032's functions raise on purpose. */
const NOT_ALLOWED = "42501";

/**
 * Thin wrapper. Who may assign, whether the responder has a unit, whether
 * the record can take an assignment, the audit row - all of it is in
 * `assign_responder`, so the whole thing is one transaction.
 */
export async function assignResponder(
  target: { kind: BoardKind; id: string },
  responderId: string,
): Promise<AssignResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_responder", {
    p_incident_id: target.kind === "report" ? target.id : null,
    p_sos_id: target.kind === "sos" ? target.id : null,
    p_responder_id: responderId,
  });

  if (error) {
    // TODO: replace with real telemetry once a logger exists.
    console.error("assign_responder failed", { target, code: error.code, message: error.message });
    return { ok: false, code: error.code === NOT_ALLOWED ? "not_allowed" : "failed" };
  }

  revalidatePath("/console");
  return { ok: true, assignmentId: (data as string | null) ?? null };
}

/** The master admin, or the responder themselves, saying it is done. */
export async function closeAssignment(assignmentId: string): Promise<AssignResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_assignment", {
    p_assignment_id: assignmentId,
  });

  if (error) {
    // TODO: replace with real telemetry once a logger exists.
    console.error("close_assignment failed", { assignmentId, code: error.code, message: error.message });
    return { ok: false, code: error.code === NOT_ALLOWED ? "not_allowed" : "failed" };
  }

  revalidatePath("/console");
  return { ok: true, assignmentId: null };
}
