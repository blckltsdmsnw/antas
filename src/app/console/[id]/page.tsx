"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SimulationBanner } from "@/components/SimulationBanner";
import { ReasonList } from "@/components/ReasonList";
import { decideSos } from "@/app/actions/decide-sos";
import { DISMISS_REASONS, dismissReasonLabel } from "@/lib/sos/decision";
import {
  formatAccuracy,
  needsLocationConfirmation,
} from "@/lib/reports/accuracy";
import { type DepthLevel } from "@/lib/depth/scale";
import { depthName } from "@/lib/depth/name";
import { type HazardType } from "@/lib/hazard/types";
import { hazardName } from "@/lib/hazard/name";
import { formatPhone } from "@/lib/profile/phone";
import { useCopy } from "@/lib/i18n/context";
import type { Reason } from "@/lib/scoring/types";

interface Detail {
  id: string;
  barangay: string | null;
  depth: DepthLevel | null;
  hazard_type: HazardType | null;
  status: string;
  trust_score: number | null;
  confidence: string | null;
  reasons: Reason[];
  note: string | null;
  photo_path: string;
  gps_accuracy_m: number | null;
  created_at: string;
  lat: number;
  lon: number;
  rainfall_24h_mm: number | null;
  elevation_m: number | null;
  surrounding_elevation_m: number | null;
  corroborating_reports: number | null;
  provider_ok: boolean | null;
  reporter_phone: string | null;
}

/**
 * Directions to the pin, not a map of it.
 *
 * The console already says where the signal is; what a moderator lacks is the
 * route from wherever they are. `dir/?api=1&destination=` is the documented
 * Google Maps URL form and hands off to the installed app on a phone, which is
 * the device this would actually be used from.
 */
function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

export default function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const copy = useCopy();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("sos_detail", { signal_id: id });
    const row = ((data as Detail[]) ?? [])[0] ?? null;
    setDetail(row);

    if (row) {
      // The bucket is private; a distressed person's photograph must never sit
      // behind a guessable public URL.
      const { data: signed, error } = await supabase.storage
        .from("sos-photos")
        .createSignedUrl(row.photo_path, 300);

      // An SOS cannot exist without a photo - the live capture is mandatory -
      // so a missing URL here is always a failure, never an absence. Rendering
      // the image only when a URL came back is how a policy that denied every
      // photo to every moderator went unnoticed: the card simply appeared
      // without one, and looked like a signal that had none.
      setPhotoUrl(signed?.signedUrl ?? null);
      setPhotoError(error ? error.message : signed?.signedUrl ? null : "walang URL");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(decision: "confirmed" | "dismissed") {
    setBusy(true);
    setError(null);
    const result = await decideSos(id, decision, decision === "dismissed" ? reason : null);
    setBusy(false);

    if (!result.ok) {
      setError(
        result.code === "no_reason"
          ? copy.screens.decideNoReason
          : copy.screens.decideFailed,
      );
      return;
    }
    router.push("/console");
  }

  if (!detail) {
    return (
      <>
        <SimulationBanner />
        <main className="console-page">
          <p className="task-lede">{copy.screens.signalLoading}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <SimulationBanner />
      <main className="console-page">
        {/* The sender's own words where they gave them, and the plain fact
            otherwise. An SOS no longer asks for a depth, so most signals from
            here on carry none; the optional chips may carry a hazard instead,
            which is equally theirs. Inventing either would put a claim into a
            record a moderator reads as the sender's own. */}
        <h1 className="task-title">
          {detail.depth
            ? depthName(detail.depth, copy.map)
            : detail.hazard_type
              ? hazardName(detail.hazard_type, copy.hazard)
              : copy.screens.signalTitle}
        </h1>
        <p className="task-lede">
          {detail.barangay} · {new Date(detail.created_at).toLocaleString("en-PH")}
          {detail.trust_score !== null
            ? ` · ${detail.confidence} (${detail.trust_score}/100)`
            : ` · ${copy.screens.signalUnscored}`}
        </p>

        {/* A moderator deciding where to send people needs to know how much to
            trust the pin itself. Without this, a fix uncertain by kilometres
            looks exactly like one accurate to the doorstep. */}
        {needsLocationConfirmation(detail.gps_accuracy_m) && (
          <p className="alert" style={{ marginTop: 16 }}>
            {copy.screens.signalVagueLocation(
              formatAccuracy(detail.gps_accuracy_m),
            )}
          </p>
        )}

        {/* Above the assessment on purpose. Reaching the person and getting to
            them are the two things that are useful before a decision is made -
            and a moderator may want to call precisely because the signal is
            ambiguous. */}
        <div className="reach">
          {detail.reporter_phone ? (
            <a className="reach-call" href={`tel:${detail.reporter_phone}`}>
              {copy.screens.signalCall(formatPhone(detail.reporter_phone))}
            </a>
          ) : (
            // Said out loud rather than left as a missing button. "No number"
            // and "the button did not render" look identical otherwise.
            <p className="reach-none">{copy.screens.signalNoPhone}</p>
          )}

          <a
            className="reach-route"
            href={directionsUrl(detail.lat, detail.lon)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.screens.signalDirections}
          </a>

          {detail.reporter_phone && (
            // Labelled unverified because it is. No SMS provider means no code
            // was ever sent, and a number presented as checked when it was
            // merely typed is a moderator trusting the wrong thing.
            <p className="reach-caveat">{copy.screens.signalPhoneUnverified}</p>
          )}
        </div>

        <h2 className="sheet-count">{copy.screens.signalAssessment}</h2>
        <ReasonList reasons={detail.reasons ?? []} />

        {detail.note && (
          <p className="notice" style={{ marginTop: 20 }}>
            &ldquo;{detail.note}&rdquo;
          </p>
        )}

        {photoUrl ? (
          <img
            src={photoUrl}
            alt={copy.screens.signalPhotoAlt}
            style={{ width: "100%", borderRadius: 12, marginTop: 20 }}
          />
        ) : (
          // Said out loud. The photograph is the only part of a signal that a
          // slider drag cannot fake, so a moderator judging one without it
          // needs to know that is what is happening rather than assuming the
          // sender simply did not send one - which they cannot.
          <p className="alert" style={{ marginTop: 20 }}>
            <strong>{copy.screens.signalPhotoFailed}</strong>{" "}
            {copy.screens.signalPhotoMissing}
            {photoError ? ` (${photoError})` : ""}
          </p>
        )}

        <h2 className="sheet-count" style={{ marginTop: 28 }}>
          {copy.screens.signalDecision}
        </h2>

        <button className="btn" onClick={() => decide("confirmed")} disabled={busy}>
          {copy.screens.signalConfirm}
        </button>

        <label className="field" style={{ marginTop: 20 }}>
          <span className="field-label">{copy.screens.signalDismissReason}</span>
          <select
            className="field-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">{copy.screens.signalChoose}</option>
            {DISMISS_REASONS.map((r) => (
              <option key={r} value={r}>
                {dismissReasonLabel(r, copy.screens)}
              </option>
            ))}
          </select>
        </label>

        <button
          className="btn"
          style={{ background: "var(--danger)" }}
          onClick={() => decide("dismissed")}
          disabled={busy || reason === ""}
        >
          {copy.screens.signalDismiss}
        </button>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </main>
    </>
  );
}
