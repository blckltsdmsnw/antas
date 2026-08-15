"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDismissReason, type DismissReason } from "@/lib/sos/decision";

/**
 * A code, not a sentence.
 *
 * A server action has no business holding user-facing prose once the product
 * carries two languages: it would have to resolve the reader's language itself,
 * and every caller would be stuck with whatever it chose. The console maps
 * these onto `copy.screens` instead.
 */
export type DecideError = "no_reason" | "failed";

export type DecideResult = { ok: true } | { ok: false; code: DecideError };

/**
 * Thin wrapper. Every rule - barangay scope, valid transition, reason
 * required, reputation, suspension - lives in the `decide_sos` Postgres
 * function so the whole decision is one transaction. Re-implementing any of it
 * here would create a second source of truth that drifts.
 */
export async function decideSos(
  signalId: string,
  decision: "confirmed" | "dismissed",
  reason: string | null,
): Promise<DecideResult> {
  if (decision === "dismissed" && (reason === null || !isDismissReason(reason))) {
    return { ok: false, code: "no_reason" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_sos", {
    signal_id: signalId,
    decision,
    reason: (reason as DismissReason | null) ?? null,
  });

  if (error) {
    // TODO: replace with real telemetry once a logger exists.
    console.error("decide_sos failed", {
      signalId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, code: "failed" };
  }

  revalidatePath("/console");
  return { ok: true };
}
