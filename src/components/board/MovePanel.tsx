"use client";

import { useEffect, useRef, useState } from "react";
import { columnLabel, moveNeeds, type BoardColumn, type BoardRow } from "@/lib/board/types";
import { DISMISS_REASONS, dismissReasonLabel } from "@/lib/sos/decision";
import { HIDE_REASONS, hideReasonLabel } from "@/lib/reports/decision";
import { unitLabel, isResponderUnit } from "@/lib/responder/types";
import { formatPhone } from "@/lib/profile/phone";
import { useCopy } from "@/lib/i18n/context";

/** One row of `responder_roster()`. */
export interface RosterEntry {
  user_id: string;
  name: string;
  unit: string;
  barangay: string | null;
  phone: string | null;
}

/**
 * What a move has to ask before it happens.
 *
 * "Hindi totoo" asks for a reason, from the vocabulary that fits the record:
 * dismissing an SOS and hiding a report are different judgements with
 * different words (lib/sos/decision.ts and lib/reports/decision.ts say
 * why). For an SOS this is the path that raises false_report_count and can
 * suspend an account, and a drag must never do that quietly.
 *
 * "May nakatalaga" asks for a person. The column asserts one is on it, so
 * it cannot be entered without choosing.
 */
export function MovePanel({
  row,
  to,
  roster,
  onCancel,
  onConfirm,
}: {
  row: BoardRow;
  to: BoardColumn;
  roster: RosterEntry[];
  onCancel: () => void;
  onConfirm: (reason: string | null, responderId: string | null) => void;
}) {
  const copy = useCopy();
  const need = moveNeeds(to);
  const [reason, setReason] = useState("");
  const [responderId, setResponderId] = useState("");
  const first = useRef<HTMLSelectElement | HTMLInputElement | null>(null);

  useEffect(() => {
    first.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const title = need === "reason" ? copy.board.reasonPrompt : copy.board.pickResponder;
  const ready = need === "reason" ? reason !== "" : responderId !== "";

  return (
    <div className="board-panel" onClick={onCancel}>
      <div
        className="board-panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="board-panel-title" className="sheet-count">
          {title}
        </h2>
        <p className="board-card-meta">
          {row.kind === "sos" ? copy.board.kindSos : copy.board.kindReport} ·{" "}
          {columnLabel(row.board_column, copy.board)} → {columnLabel(to, copy.board)}
        </p>

        {need === "reason" && (
          <label className="field">
            <span className="field-label">
              {row.kind === "sos" ? copy.screens.signalDismissReason : copy.screens.reportHideReason}
            </span>
            <select
              ref={first as React.RefObject<HTMLSelectElement>}
              className="field-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">{copy.screens.signalChoose}</option>
              {row.kind === "sos"
                ? DISMISS_REASONS.map((r) => (
                    <option key={r} value={r}>{dismissReasonLabel(r, copy.screens)}</option>
                  ))
                : HIDE_REASONS.map((r) => (
                    <option key={r} value={r}>{hideReasonLabel(r, copy.screens)}</option>
                  ))}
            </select>
          </label>
        )}

        {need === "responder" && roster.length === 0 && (
          <p className="notice">{copy.board.rosterEmpty}</p>
        )}

        {need === "responder" && roster.length > 0 && (
          <div className="board-roster" role="radiogroup" aria-label={copy.board.pickResponder}>
            {roster.map((entry, i) => (
              <label key={entry.user_id} className="board-roster-row">
                <input
                  ref={i === 0 ? (first as React.RefObject<HTMLInputElement>) : undefined}
                  type="radio"
                  name="responder"
                  value={entry.user_id}
                  checked={responderId === entry.user_id}
                  onChange={() => setResponderId(entry.user_id)}
                />
                <span>
                  <strong>{entry.name}</strong>
                  {" · "}
                  {isResponderUnit(entry.unit) ? unitLabel(entry.unit, copy.board) : entry.unit}
                  {entry.barangay ? ` · ${entry.barangay}` : ""}
                  {entry.phone ? ` · ${formatPhone(entry.phone)}` : ""}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="report-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            {copy.board.cancel}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!ready}
            onClick={() =>
              onConfirm(need === "reason" ? reason : null, need === "responder" ? responderId : null)
            }
          >
            {need === "reason" ? copy.board.reasonConfirm : copy.board.assign}
          </button>
        </div>
      </div>
    </div>
  );
}
