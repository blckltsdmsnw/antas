"use server";

import { createClient } from "@/lib/supabase/server";
import { validateReport, type ReportErrorCode } from "@/lib/reports/validate";
import { scoreSignal } from "@/lib/scoring/score";
import { openMeteoProvider } from "@/lib/env/open-meteo";
import type { DepthLevel } from "@/lib/depth/scale";
import { buildSosRow, type SosInput } from "@/lib/sos/row";

export type { SosInput };

export type SosErrorCode =
  | ReportErrorCode
  | "not_signed_in"
  | "already_active"
  | "insert_failed";

export type SosResult =
  | { ok: true; signalId: string }
  | { ok: false; errors: SosErrorCode[] };

export async function submitSos(input: SosInput): Promise<SosResult> {
  const validation = validateReport({
    depth: input.depth,
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

  // Enrichment and scoring are deliberately AFTER the signal exists. The
  // signal must survive even if every enrichment step fails - the system
  // never refuses an SOS.
  void enrichAndScore(inserted.id, input, userData.user.created_at);

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
  accountCreatedAt: string | undefined,
): Promise<void> {
  try {
    const supabase = await createClient();

    const [reading, corroboration] = await Promise.all([
      openMeteoProvider.read(input.lat, input.lon),
      supabase.rpc("corroborating_reports", {
        lat: input.lat,
        lon: input.lon,
        radius_m: 500,
        within_minutes: 60,
      }),
    ]);

    const corroboratingReports =
      typeof corroboration.data === "number" ? corroboration.data : 0;

    const providerOk =
      reading.rainfall24hMm !== null || reading.elevationM !== null;

    const result = scoreSignal({
      claimedDepth: input.depth as DepthLevel,
      gpsAccuracyM: input.gpsAccuracyM,
      hasLivePhoto: input.photoPath.length > 0,
      accountAgeMinutes: minutesSince(accountCreatedAt),
      reporterConfirmedCount: 0,
      reporterFalseReportCount: 0,
      corroboratingReports,
      rainfall24hMm: reading.rainfall24hMm,
      elevationM: reading.elevationM,
      surroundingElevationM: reading.surroundingElevationM,
    });

    // Snapshot the environment AS IT WAS. Re-checking the weather days later
    // reveals nothing about conditions when the signal was sent, and a
    // moderator reviewing an old signal needs what was true at the time.
    await supabase.from("env_snapshots").upsert({
      sos_id: signalId,
      rainfall_24h_mm: reading.rainfall24hMm,
      elevation_m: reading.elevationM,
      surrounding_elevation_m: reading.surroundingElevationM,
      corroborating_reports: corroboratingReports,
      provider_ok: providerOk,
    });

    await supabase
      .from("sos_signals")
      .update({
        trust_score: result.score,
        confidence: result.confidence,
        reasons: result.reasons,
      })
      .eq("id", signalId);
  } catch (error) {
    // Never rethrow: a scoring failure must not surface to a person in danger.
    // TODO: replace with real telemetry once a logger exists.
    console.error("sos enrichment failed", { signalId, error });
  }
}
