"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDismissReason, type DismissReason } from "@/lib/sos/decision";

export type DecideResult = { ok: true } | { ok: false; message: string };

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
    return { ok: false, message: "Pumili ng dahilan bago i-dismiss." };
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
    return { ok: false, message: "Hindi naitala ang desisyon. Subukan ulit." };
  }

  revalidatePath("/console");
  return { ok: true };
}
