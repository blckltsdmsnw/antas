"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { closeAssignment } from "@/app/actions/assign";
import type { DepthLevel } from "@/lib/depth/scale";
import { depthName } from "@/lib/depth/name";
import type { HazardType, Severity } from "@/lib/hazard/types";
import { hazardName, severityWord } from "@/lib/hazard/name";
import { HazardIcon } from "@/components/HazardIcon";
import { formatAccuracy, needsLocationConfirmation } from "@/lib/reports/accuracy";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { formatPhone } from "@/lib/profile/phone";
import { timestampLabel } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

/** One row of `my_assignments()`. */
export interface MyAssignment {
  assignment_id: string;
  kind: "sos" | "report";
  target_id: string;
  hazard_type: HazardType | null;
  severity: Severity | null;
  depth: DepthLevel | null;
  barangay: string | null;
  note: string | null;
  photo_path: string | null;
  created_at: string;
  assigned_at: string;
}

/** One row of `assignment_detail()`, fetched only when the card is opened. */
interface Detail {
  lat: number;
  lon: number;
  gps_accuracy_m: number | null;
  reporter_phone: string | null;
}

function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

/**
 * What a responder was put on, opening into where it is and whom to ring.
 *
 * Opening is a real fetch, as on ReportCard, and for the same reason: the
 * phone number comes from `assignment_detail()`, which writes an audit row.
 * A responder's list holds what identifies each incident; the act of
 * opening one is the act that gets logged, because it precedes a call.
 *
 * "Tapos na" closes the assignment, which ends this person's access to the
 * record. Two taps, in place, like Tanggalin on /ako.
 */
export function AssignmentCard({
  assignment,
  onClosed,
}: {
  assignment: MyAssignment;
  onClosed: () => void;
}) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const what =
    assignment.hazard_type === null
      ? copy.board.unspecifiedHazard
      : assignment.hazard_type === "flood"
        ? assignment.depth !== null
          ? depthName(assignment.depth, copy.map)
          : hazardName("flood", copy.hazard)
        : assignment.severity !== null
          ? `${hazardName(assignment.hazard_type, copy.hazard)} · ${severityWord(assignment.hazard_type, assignment.severity, copy.hazard)}`
          : hazardName(assignment.hazard_type, copy.hazard);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (detail) return;

    const supabase = createClient();
    const { data } = await supabase.rpc("assignment_detail", {
      p_assignment_id: assignment.assignment_id,
    });
    setDetail(((data as Detail[]) ?? [])[0] ?? null);

    // A report's photo is in the public bucket; an SOS photo is private and
    // needs a signed URL, which the storage policy now grants to an assigned
    // responder (0032 §9).
    if (assignment.photo_path) {
      if (assignment.kind === "report") {
        setPhotoUrl(reportPhotoUrl(assignment.photo_path));
      } else {
        const { data: signed } = await supabase.storage
          .from("sos-photos")
          .createSignedUrl(assignment.photo_path, 300);
        setPhotoUrl(signed?.signedUrl ?? null);
      }
    }
  }

  async function done() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await closeAssignment(assignment.assignment_id);
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      setError(copy.board.assignedFailed);
      return;
    }
    onClosed();
  }

  return (
    <article className="report-card" data-band="assigned">
      <button
        className="report-head"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? copy.board.assignedClose : copy.board.assignedOpen}
      >
        <span className="report-band" data-band="assigned">
          {assignment.kind === "sos" ? copy.board.kindSos : copy.board.kindReport}
        </span>
        {assignment.hazard_type && <HazardIcon hazard={assignment.hazard_type} size="sm" />}
        <strong>{what}</strong>
        <span className="report-meta">
          {assignment.barangay ?? copy.screens.signalNoBarangay} ·{" "}
          {timestampLabel(assignment.created_at, copy.screens)} ·{" "}
          {copy.board.assignedSince(timestampLabel(assignment.assigned_at, copy.screens))}
        </span>
      </button>

      {open && detail === null && <p className="task-lede">{copy.screens.consoleLoading}</p>}

      {open && detail !== null && (
        <div className="report-body">
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="report-photo" src={photoUrl} alt={copy.screens.signalPhotoAlt} />
          )}

          {assignment.note && (
            <p className="notice">
              {copy.board.assignedNote} &ldquo;{assignment.note}&rdquo;
            </p>
          )}

          {needsLocationConfirmation(detail.gps_accuracy_m) && (
            <p className="notice">
              {detail.gps_accuracy_m === null
                ? copy.screens.reportVagueUnknown
                : copy.screens.reportVague(formatAccuracy(detail.gps_accuracy_m))}
            </p>
          )}

          <div className="reach">
            {detail.reporter_phone ? (
              <a className="reach-call" href={`tel:${detail.reporter_phone}`}>
                {copy.board.assignedCall(formatPhone(detail.reporter_phone))}
              </a>
            ) : (
              <p className="reach-none">{copy.board.assignedNoPhone}</p>
            )}
            <a
              className="reach-route"
              href={directionsUrl(detail.lat, detail.lon)}
              target="_blank"
              rel="noreferrer"
            >
              {copy.board.assignedDirections}
            </a>
            {detail.reporter_phone && (
              <p className="reach-caveat">{copy.board.assignedPhoneUnverified}</p>
            )}
          </div>

          {error && <p className="alert" role="alert">{error}</p>}

          <div className="report-actions">
            <button className="btn" onClick={() => void done()} disabled={busy}>
              {confirming ? copy.board.assignedDoneSure : copy.board.assignedDone}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
