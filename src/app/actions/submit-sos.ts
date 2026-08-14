"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateLocation, type ReportErrorCode } from "@/lib/reports/validate";
import { scoreSignal } from "@/lib/scoring/score";
import { openMeteoProvider } from "@/lib/env/open-meteo";
import type { DepthLevel } from "@/lib/depth/scale";
import { buildSosRow, type SosInput } from "@/lib/sos/row";

export type { SosInput };

/**
 * `invalid_depth` is deliberately absent.
 *
 * It comes with `ReportErrorCode`, and an SOS can no longer produce it: the
 * sender is never asked for a depth, so there is no depth to be invalid. Naming
 * the two codes that can actually occur keeps the page from carrying a message
 * for a failure that cannot happen.
 */
export type SosErrorCode =
  | Exclude<ReportErrorCode, "invalid_depth">
  | "not_signed_in"
  | "already_active"
  | "insert_failed";

export type SosResult =
  | { ok: true; signalId: string }
  | { ok: false; errors: SosErrorCode[] };

export async function submitSos(input: SosInput): Promise<SosResult> {
  // Location only. An SOS carries no depth, and failing one on `invalid_depth`
  // would be refusing a call for help over a field the sender was deliberately
  // never shown.
  const validation = validateLocation({
    lat: input.lat,
    lon: input.lon,
    gpsAccuracyM: input.gpsAccuracyM,
  });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, errors: ["not_signed_in"] };
  }

  const { data: inserted, error } = await supabase
    .from("sos_signals")
    .insert(buildSosRow(userData.user.id, input))
    .select("id")
    .single();

  if (error) {
    // 23505 is the partial unique index: this account already has an active
    // signal. That is a distinct, actionable situation, not a generic failure.
    if (error.code === "23505") {
      return { ok: false, errors: ["already_active"] };
    }
    // TODO: replace with real telemetry once a logger exists.
    console.error("sos insert failed", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return { ok: false, errors: ["insert_failed"] };
  }

  // Enrichment runs AFTER the signal exists and AFTER the response is sent.
  //
  // `after()` rather than a bare `void`: unawaited work in a Server Action is
  // dropped once the response is flushed, silently. That is not theoretical -
  // it shipped in this file and produced 22 signals with no score, no
  // confidence and no reasons, with nothing logged. `after()` is the API that
  // keeps the work alive past the response.
  //
  // The response is still sent immediately: a person standing in floodwater
  // must not wait on a weather API before being told their signal went out.
  after(() =>
    enrichAndScore(
      inserted.id,
      input,
      userData.user.id,
      userData.user.created_at,
    ),
  );

  return { ok: true, signalId: inserted.id };
}

function minutesSince(iso: string | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, (Date.now() - created) / 60_000);
}

async function enrichAndScore(
  signalId: string,
  input: SosInput,
  reporterId: string,
  accountCreatedAt: string | undefined,
): Promise<void> {
  try {
    // The service-role client, not the user's. By design `authenticated` has
    // no UPDATE on sos_signals and no grant at all on env_snapshots - a
    // reporter must never be able to write their own trust score. Enrichment
    // is the server acting on its own behalf.
    const supabase = createAdminClient();

    const [reading, corroboration, reputation] = await Promise.all([
      openMeteoProvider.read(input.lat, input.lon),
      supabase.rpc("corroborating_reports", {
        lat: input.lat,
        lon: input.lon,
        radius_m: 500,
        within_minutes: 60,
      }),
      // The reporter's own history. `decide_sos` has maintained this table since
      // 0010 and nothing ever read it back - the two counts below were passed as
      // literal zeros, so every moderator decision fed a loop that was not
      // connected at the far end. Scoring treated a reporter with twenty
      // confirmed floods exactly like somebody who signed up a minute ago.
      supabase
        .from("reputation")
        .select("confirmed_count, false_report_count")
        .eq("user_id", reporterId)
        .maybeSingle(),
    ]);

    const corroboratingReports =
      typeof corroboration.data === "number" ? corroboration.data : 0;

    // Absent history reads as none, never as bad history. A first-time reporter
    // and a reporter whose row simply failed to load must not be scored as
    // though they had a record of fabricating.
    const confirmedCount = reputation.data?.confirmed_count ?? 0;
    const falseReportCount = reputation.data?.false_report_count ?? 0;

    const providerOk =
      reading.rainfall24hMm !== null || reading.elevationM !== null;

    const result = scoreSignal({
      // Never asked. Not a shallow claim - see isDeepClaim.
      claimedDepth: null,
      gpsAccuracyM: input.gpsAccuracyM,
      hasLivePhoto: input.photoPath.length > 0,
      accountAgeMinutes: minutesSince(accountCreatedAt),
      reporterConfirmedCount: confirmedCount,
      reporterFalseReportCount: falseReportCount,
      corroboratingReports,
      rainfall24hMm: reading.rainfall24hMm,
      elevationM: reading.elevationM,
      surroundingElevationM: reading.surroundingElevationM,
    });

    // Snapshot the environment AS IT WAS. Re-checking the weather days later
    // reveals nothing about conditions when the signal was sent, and a
    // moderator reviewing an old signal needs what was true at the time.
    // supabase-js does NOT throw when a write is refused - it returns an
    // error object. Ignoring these return values is how enrichment failed
    // silently for every signal. Check both.
    const snapshot = await supabase.from("env_snapshots").upsert({
      sos_id: signalId,
      rainfall_24h_mm: reading.rainfall24hMm,
      elevation_m: reading.elevationM,
      surrounding_elevation_m: reading.surroundingElevationM,
      corroborating_reports: corroboratingReports,
      provider_ok: providerOk,
    });

    if (snapshot.error) {
      // TODO: replace with real telemetry once a logger exists.
      console.error("env snapshot write failed", {
        signalId,
        code: snapshot.error.code,
        message: snapshot.error.message,
      });
    }

    const scored = await supabase
      .from("sos_signals")
      .update({
        trust_score: result.score,
        confidence: result.confidence,
        reasons: result.reasons,
      })
      .eq("id", signalId);

    if (scored.error) {
      // TODO: replace with real telemetry once a logger exists.
      console.error("sos scoring write failed", {
        signalId,
        code: scored.error.code,
        message: scored.error.message,
      });
    }
  } catch (error) {
    // Never rethrow: a scoring failure must not surface to a person in danger.
    // TODO: replace with real telemetry once a logger exists.
    console.error("sos enrichment failed", { signalId, error });
  }
}
