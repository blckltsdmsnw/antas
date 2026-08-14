"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_VAR } from "@/lib/depth/presentation";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { timestampLabel } from "@/lib/time/relative";
import { hideReport } from "@/app/actions/submit-update";
import { formatPhone, normalizePhone } from "@/lib/profile/phone";

/**
 * Your own reports.
 *
 * A report used to vanish the moment it was sent - one pin among hundreds, with
 * no way to see what you had contributed or to notice you had picked the wrong
 * depth. Asking people to volunteer information and then hiding it from them is
 * a poor deal.
 *
 * The status shown is the report's REAL status column, not an invented review
 * pipeline. Depth reports are not moderated - only SOS signals are - so the
 * three states here are the three the database actually has. Showing
 * "Pinoproseso" over a report nobody is processing would be theatre.
 */

interface MyReport {
  id: string;
  depth: DepthLevel;
  reported_at: string;
  photo_path: string | null;
  lat: number;
  lon: number;
  barangay: string | null;
  status: string;
}

/** The database's own three states, in the words a reporter would use. */
const STATUS_LABEL: Record<string, string> = {
  active: "Nasa mapa",
  flagged: "Sinusuri",
  hidden: "Tinanggal sa mapa",
};

type Stage = "loading" | "signed-out" | "ready" | "failed";

export default function AkoPage() {
  const [stage, setStage] = useState<Stage>("loading");
  const [reports, setReports] = useState<MyReport[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [phoneStage, setPhoneStage] = useState<
    "idle" | "saving" | "saved" | "invalid" | "failed"
  >("idle");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      setStage("signed-out");
      return;
    }
    setEmail(auth.user.email ?? null);

    // Own row only - `profiles` is scoped to `id = auth.uid()`, so this can
    // never return somebody else's number.
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profile?.phone) {
      setSavedPhone(profile.phone as string);
      setPhone(formatPhone(profile.phone as string));
    }

    const { data, error } = await supabase.rpc("my_reports");
    if (error) {
      // Same rule as the map: a failed load must not be dressed up as an empty
      // one. "You have filed nothing" and "we could not check" are different
      // sentences, and only one of them is true.
      setStage("failed");
      return;
    }

    setReports((data ?? []) as MyReport[]);
    setStage("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Two taps, not a modal.
   *
   * Removing a report is reversible in principle - the row is only hidden - but
   * not by the person doing it, so it should not happen on one stray thumb. The
   * button asks "sigurado ka?" in place rather than opening a dialogue, which
   * on a phone is both faster and harder to dismiss by accident.
   */
  const remove = useCallback(
    async (reportId: string) => {
      if (confirming !== reportId) {
        setConfirming(reportId);
        return;
      }

      setRemoving(reportId);
      const result = await hideReport(reportId);
      setRemoving(null);
      setConfirming(null);

      if (!result.ok) {
        setStage("failed");
        return;
      }
      await load();
    },
    [confirming, load],
  );

  /**
   * The number, saved normalised.
   *
   * Validated here and again by a check constraint on the column, because a
   * number stored in a shape that will not dial is discovered by somebody
   * failing to reach a person in a flood - far too late to be a bug report.
   */
  const savePhone = useCallback(async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setPhoneStage("invalid");
      return;
    }

    setPhoneStage("saving");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setPhoneStage("failed");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ phone: normalized })
      .eq("id", auth.user.id);

    if (error) {
      setPhoneStage("failed");
      return;
    }

    setSavedPhone(normalized);
    setPhone(formatPhone(normalized));
    setPhoneStage("saved");
  }, [phone]);

  return (
    <main className="task-page">
      <h1 className="task-title">Ako</h1>

      {stage === "loading" && (
        <p className="task-lede">Kinukuha ang mga report mo...</p>
      )}

      {stage === "signed-out" && (
        <>
          <p className="task-lede">
            Mag-sign in para makita ang mga report mo. Hindi kailangan ng account
            para tingnan ang mapa.
          </p>
          <Link href="/login" className="btn">
            Mag-sign in
          </Link>
        </>
      )}

      {stage === "failed" && (
        <>
          <p className="alert">
            <strong>Hindi makuha ang mga report mo ngayon.</strong> Hindi ibig
            sabihin nito na wala kang naipadala.
          </p>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void load()}
          >
            Subukan ulit
          </button>
        </>
      )}

      {stage === "ready" && (
        <>
          {email && <p className="task-lede">Naka-sign in bilang {email}</p>}

          {/* Optional, and said so plainly. A required phone number on a flood
              map is a reason not to report at all, and most people using this
              are only looking at the water - the number matters to the one
              person in a hundred who sends an SOS. */}
          <section className="phone-card">
            <h2 className="my-reports-title" style={{ marginTop: 0 }}>
              Numero para sa emergency
            </h2>
            <p className="phone-note">
              Kung magpapadala ka ng SOS, ito ang tatawagan ng barangay.
              Hindi ito nakikita sa mapa at walang ibang user ang makakakita
              nito. Puwede mo ring iwanang blangko.
            </p>

            <label className="field">
              <span className="field-label">Mobile number</span>
              <input
                className="field-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0917 123 4567"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneStage("idle");
                }}
              />
            </label>

            <button
              type="button"
              className="btn btn-quiet"
              disabled={phoneStage === "saving" || phone.trim() === ""}
              onClick={() => void savePhone()}
            >
              {phoneStage === "saving" ? "Sine-save..." : "I-save ang numero"}
            </button>

            {phoneStage === "invalid" && (
              <p className="alert" role="alert">
                Hindi mukhang Philippine mobile number iyan. Subukan ang
                anyong <strong>0917 123 4567</strong>.
              </p>
            )}
            {phoneStage === "failed" && (
              <p className="alert" role="alert">
                Hindi na-save ang numero. Subukan ulit.
              </p>
            )}
            {phoneStage === "saved" && (
              <p className="phone-note">Naka-save na ang numero mo.</p>
            )}
            {phoneStage === "idle" && savedPhone && (
              <p className="phone-note">
                Naka-save: {formatPhone(savedPhone)}
              </p>
            )}
          </section>

          <h2 className="my-reports-title">Aking mga Report</h2>

          {reports.length === 0 ? (
            <p className="task-lede">
              Wala ka pang naipadalang report.{" "}
              <Link href="/report" className="quiet-link">
                Mag-report ng lalim ng tubig
              </Link>
              .
            </p>
          ) : (
            <ul className="my-reports">
              {reports.map((report) => {
                const photo = reportPhotoUrl(report.photo_path);
                return (
                  <li key={report.id} className="my-report">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="my-report-photo" src={photo} alt="" />
                    ) : (
                      <span
                        className="my-report-swatch"
                        style={{ background: DEPTH_VAR[report.depth] }}
                        aria-hidden="true"
                      />
                    )}

                    <div className="my-report-body">
                      <p className="my-report-depth">
                        {depthLabel(report.depth).tl}
                      </p>
                      <p className="my-report-where">
                        {report.barangay ?? "Hindi matukoy na lugar"}
                      </p>
                      <p className="my-report-when">
                        {timestampLabel(report.reported_at)}
                      </p>
                    </div>

                    <div className="my-report-side">
                      <span
                        className="my-report-status"
                        data-status={report.status}
                      >
                        {STATUS_LABEL[report.status] ?? report.status}
                      </span>

                      {/* Only while it is on the map. Offering "remove" against
                          something already removed is a button that can only
                          disappoint. */}
                      {report.status === "active" && (
                        <button
                          type="button"
                          className="my-report-remove"
                          data-confirming={confirming === report.id}
                          disabled={removing === report.id}
                          onClick={() => void remove(report.id)}
                        >
                          {confirming === report.id ? "Sigurado ka?" : "Tanggalin"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
