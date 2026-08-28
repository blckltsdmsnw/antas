"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decideReport } from "@/app/actions/decide-report";
import { type DepthLevel } from "@/lib/depth/scale";
import { depthName } from "@/lib/depth/name";
import type { HazardType, Severity } from "@/lib/hazard/types";
import { hazardName, severityWord } from "@/lib/hazard/name";
import { HazardIcon } from "@/components/HazardIcon";
import {
  HIDE_REASONS,
  hideReasonLabel,
  priorityLabel,
} from "@/lib/reports/decision";
import {
  formatAccuracy,
  needsLocationConfirmation,
} from "@/lib/reports/accuracy";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { formatPhone } from "@/lib/profile/phone";
import { timestampLabel } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

/** One row of `report_queue()`. */
export interface QueueReport {
  id: string;
  barangay: string | null;
  hazard_type: HazardType;
  severity: Severity;
  depth: DepthLevel | null;
  status: string;
  triage_state: "needs_checking" | "not_true" | "needs_attention";
  priority: string;
  reported_at: string;
  has_photo: boolean;
  gps_accuracy_m: number | null;
  answers: number;
}

/** One row of `report_detail()`, fetched only when a card is opened. */
interface ReportDetailRow extends QueueReport {
  photo_path: string | null;
  lat: number;
  lon: number;
  reporter_phone: string | null;
  reporter_confirmed: number;
  reporter_false: number;
}

/**
 * Directions to the pin, not a map of it - the same reasoning, and the same
 * documented URL form, as the SOS detail page.
 */
function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

/**
 * A report in the moderator's queue, opening into what is needed to act on it.
 *
 * Opening is a real fetch rather than the reveal of data already sitting on the
 * client, and that is deliberate: `report_detail()` carries the reporter's
 * phone number and writes an audit row every time it is called. Shipping the
 * number down with the list would hand every moderator every contact number in
 * their barangay for the price of loading a page, and leave no record of it.
 *
 * So the queue holds only what ranks a row, and opening one is the act that
 * gets logged - because it is the act that precedes a phone call.
 */
export function ReportCard({
  report,
  onDecided,
}: {
  report: QueueReport;
  onDecided: () => void;
}) {
  const copy = useCopy();
  const [detail, setDetail] = useState<ReportDetailRow | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  // A contested report leads the queue whatever its depth, so it says so rather
  // than wearing the band its depth would otherwise have earned.
  const band = report.status === "flagged" ? "flagged" : report.priority;
  const bandLabel =
    report.status === "flagged"
      ? copy.screens.priorityFlagged
      : priorityLabel(report.priority, copy.screens);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);

    // Fetched once per card. Re-opening does not re-log: the audit question is
    // "who saw this reporter's number", and a moderator collapsing and
    // re-expanding a card they are already reading has not seen it twice.
    if (detail) return;

    const { data } = await createClient().rpc("report_detail", {
      p_report_id: report.id,
    });
    setDetail(((data as ReportDetailRow[]) ?? [])[0] ?? null);
  }

  async function decide(decision: "keep" | "hide") {
    setBusy(true);
    setError(null);
    const result = await decideReport(
      report.id,
      decision,
      decision === "hide" ? reason : null,
    );
    setBusy(false);

    if (!result.ok) {
      setError(
        result.code === "no_reason"
          ? copy.screens.reportDecideNoReason
          : copy.screens.reportDecideFailed,
      );
      return;
    }
    onDecided();
  }

  const photoUrl = detail ? reportPhotoUrl(detail.photo_path) : null;

  return (
    <article className="report-card" data-band={band}>
      <button
        className="report-head"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? copy.screens.reportClose : copy.screens.reportOpen}
      >
        <span className="report-band" data-band={band}>
          {bandLabel}
        </span>
        {report.triage_state === "needs_attention" && (
          // The moment a report becomes real to other people: the master admin
          // (or this desk) confirmed it. Shown as a second pill, not a colour,
          // because colour on this row already means priority.
          <span className="report-band" data-band="confirmed">
            {copy.board.confirmedBadge}
          </span>
        )}
        <HazardIcon hazard={report.hazard_type} size="sm" />
        <strong>
          {report.hazard_type === "flood"
            ? depthName(report.depth!, copy.map)
            : `${hazardName(report.hazard_type, copy.hazard)} · ${severityWord(report.hazard_type, report.severity, copy.hazard)}`}
        </strong>
        <span className="report-meta">
          {report.barangay ?? copy.screens.signalNoBarangay} ·{" "}
          {timestampLabel(report.reported_at, copy.screens)} ·{" "}
          {report.answers > 0
            ? copy.screens.reportAnswers(report.answers)
            : copy.screens.reportNoAnswers}
        </span>
      </button>

      {open && detail === null && (
        <p className="task-lede">{copy.screens.consoleLoading}</p>
      )}

      {open && detail !== null && (
        <div className="report-body">
          {/* A path that resolves to nothing renders as a broken-image glyph
              and reads, to a moderator, as a report whose photo is simply
              missing. It is not the same fact: the file was expected and could
              not be fetched, which is a storage or policy failure worth
              knowing about. The console learned this once already on the SOS
              side, where a policy denying every photo to every moderator went
              unnoticed because the card merely appeared without one. */}
          {photoUrl && !photoFailed ? (
            <img
              className="report-photo"
              src={photoUrl}
              alt={copy.screens.signalPhotoAlt}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <p className="detail-nophoto">
              {photoFailed
                ? copy.screens.signalPhotoFailed
                : copy.screens.reportPhotoNone}
            </p>
          )}

          {/* The same warning the reporter was shown before sending. A pin
              placed by an imprecise fix may be on the wrong street, and a
              moderator deciding whether to keep it needs that fact as much as
              the person who filed it did. */}
          {needsLocationConfirmation(detail.gps_accuracy_m) && (
            <p className="notice">
              {detail.gps_accuracy_m === null
                ? copy.screens.reportVagueUnknown
                : copy.screens.reportVague(
                    formatAccuracy(detail.gps_accuracy_m),
                  )}
            </p>
          )}

          <p className="detail-sub">
            {copy.screens.reportStanding(
              detail.reporter_confirmed,
              detail.reporter_false,
            )}
          </p>

          {/* The contact number, and the reason it was collected: somebody at a
              desk ringing the person who filed the report to ask what a pin
              cannot show. Labelled unconfirmed because it is - 0022 stores what
              the reporter typed, and no SMS ever checked it. */}
          <div className="reach">
            {detail.reporter_phone ? (
              <a className="reach-call" href={`tel:${detail.reporter_phone}`}>
                {copy.screens.reportCall(formatPhone(detail.reporter_phone))}
              </a>
            ) : (
              <p className="reach-none">{copy.screens.reportNoPhoneGiven}</p>
            )}

            <a
              className="reach-route"
              href={directionsUrl(detail.lat, detail.lon)}
              target="_blank"
              rel="noreferrer"
            >
              {copy.screens.reportDirections}
            </a>

            {detail.reporter_phone && (
              <p className="reach-caveat">
                {copy.screens.reportPhoneUnverified}
              </p>
            )}
          </div>

          <label className="field">
            <span className="field-label">{copy.screens.reportHideReason}</span>
            <select
              className="field-input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="">{copy.screens.signalChoose}</option>
              {HIDE_REASONS.map((value) => (
                <option key={value} value={value}>
                  {hideReasonLabel(value, copy.screens)}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="alert" role="alert">{error}</p>}

          <div className="report-actions">
            <button
              className="btn"
              onClick={() => decide("keep")}
              disabled={busy}
            >
              {copy.screens.reportKeep}
            </button>
            <button
              className="btn"
              onClick={() => decide("hide")}
              disabled={busy}
            >
              {copy.screens.reportHide}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
