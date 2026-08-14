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
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";
import type { Reason } from "@/lib/scoring/types";

interface Detail {
  id: string;
  barangay: string | null;
  depth: DepthLevel | null;
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
}

export default function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
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
      const { data: signed } = await supabase.storage
        .from("sos-photos")
        .createSignedUrl(row.photo_path, 300);
      setPhotoUrl(signed?.signedUrl ?? null);
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
      setError(result.message);
      return;
    }
    router.push("/console");
  }

  if (!detail) {
    return (
      <>
        <SimulationBanner />
        <main className="console-page">
          <p className="task-lede">Naglo-load, o wala ka sa barangay na ito.</p>
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
            here on carry none - and inventing one would put a claim about the
            water into a record a moderator reads as theirs. */}
        <h1 className="task-title">
          {detail.depth ? depthLabel(detail.depth).tl : "Humihingi ng tulong"}
        </h1>
        <p className="task-lede">
          {detail.barangay} · {new Date(detail.created_at).toLocaleString("en-PH")}
          {detail.trust_score !== null
            ? ` · ${detail.confidence} (${detail.trust_score}/100)`
            : " · hindi pa nasusuri"}
        </p>

        {/* A moderator deciding where to send people needs to know how much to
            trust the pin itself. Without this, a fix uncertain by kilometres
            looks exactly like one accurate to the doorstep. */}
        {needsLocationConfirmation(detail.gps_accuracy_m) && (
          <p className="alert" style={{ marginTop: 16 }}>
            Malabo ang lokasyon: mga {formatAccuracy(detail.gps_accuracy_m)} ang
            puwedeng pagkakamali. Maaaring hindi ito ang tamang kalye.
          </p>
        )}

        <h2 className="sheet-count">Pagsusuri</h2>
        <ReasonList reasons={detail.reasons ?? []} />

        {detail.note && (
          <p className="notice" style={{ marginTop: 20 }}>
            &ldquo;{detail.note}&rdquo;
          </p>
        )}

        {photoUrl && (
          <img
            src={photoUrl}
            alt="Larawan ng tubig mula sa nag-report"
            style={{ width: "100%", borderRadius: 12, marginTop: 20 }}
          />
        )}

        <h2 className="sheet-count" style={{ marginTop: 28 }}>Desisyon</h2>

        <button className="btn" onClick={() => decide("confirmed")} disabled={busy}>
          Kumpirmahin
        </button>

        <label className="field" style={{ marginTop: 20 }}>
          <span className="field-label">Dahilan ng pag-dismiss</span>
          <select
            className="field-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Pumili...</option>
            {DISMISS_REASONS.map((r) => (
              <option key={r} value={r}>
                {dismissReasonLabel(r)}
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
          I-dismiss
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
