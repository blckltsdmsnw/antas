"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_VAR } from "@/lib/depth/presentation";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { timestampLabel } from "@/lib/time/relative";

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

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      setStage("signed-out");
      return;
    }
    setEmail(auth.user.email ?? null);

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

                    <span className="my-report-status" data-status={report.status}>
                      {STATUS_LABEL[report.status] ?? report.status}
                    </span>
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
