"use client";

import Link from "next/link";
import { depthName } from "@/lib/depth/name";
import { hazardName, severityWord } from "@/lib/hazard/name";
import { HazardIcon } from "@/components/HazardIcon";
import { movesFrom, columnLabel, type BoardColumn, type BoardRow } from "@/lib/board/types";
import { unitLabel } from "@/lib/responder/types";
import { timestampLabel } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

/**
 * One record on the board.
 *
 * Icon says what, the severity word says how bad, the pill says which kind
 * of record. The buttons at the bottom are the keyboard-reachable form of
 * every drag the card allows - an accessibility requirement, not a phone
 * one. They are the same moves in the same order as `movesFrom`, so a
 * reader who cannot drag loses nothing.
 */
export function BoardCard({
  row,
  onMove,
}: {
  row: BoardRow;
  onMove: (to: BoardColumn) => void;
}) {
  const copy = useCopy();

  const what =
    row.hazard_type === null
      ? copy.board.unspecifiedHazard
      : row.hazard_type === "flood"
        ? row.depth !== null
          ? depthName(row.depth, copy.map)
          : hazardName("flood", copy.hazard)
        : row.severity !== null
          ? `${hazardName(row.hazard_type, copy.hazard)} · ${severityWord(row.hazard_type, row.severity, copy.hazard)}`
          : hazardName(row.hazard_type, copy.hazard);

  const trust =
    row.kind === "sos"
      ? row.trust_score !== null
        ? `${row.confidence} · ${row.trust_score}/100`
        : copy.screens.signalUnscored
      : null;

  return (
    <article className="board-card" data-kind={row.kind} data-severity={row.severity ?? "sos"}>
      <div className="board-card-head">
        <span className="report-band" data-band={row.kind === "sos" ? "urgent" : "routine"}>
          {row.kind === "sos" ? copy.board.kindSos : copy.board.kindReport}
        </span>
        {row.hazard_type && <HazardIcon hazard={row.hazard_type} size="sm" />}
        <strong className="board-card-title">{what}</strong>
      </div>

      <p className="board-card-meta">
        {row.barangay ?? copy.screens.signalNoBarangay} ·{" "}
        {timestampLabel(row.created_at, copy.screens)}
        {trust ? ` · ${trust}` : ""}
      </p>

      {row.responder_name && row.responder_unit && (
        <p className="board-card-meta">
          {copy.board.assignedTo(row.responder_name)} · {unitLabel(row.responder_unit, copy.board)}
        </p>
      )}

      {/* The SOS detail page already exists and the master admin moderates
          everywhere, so it opens. Reports have no page of their own; their
          detail is the queue card on /console. */}
      {row.kind === "sos" && (
        <Link href={`/console/${row.id}`} className="quiet-link board-card-open">
          {copy.board.assignedOpen}
        </Link>
      )}

      <div className="board-moves">
        {movesFrom(row.board_column).map((to) => (
          <button
            key={to}
            type="button"
            className="board-move"
            onClick={() => onMove(to)}
          >
            {copy.board.moveTo(columnLabel(to, copy.board))}
          </button>
        ))}
      </div>
    </article>
  );
}
