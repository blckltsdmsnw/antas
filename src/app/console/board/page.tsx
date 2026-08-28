"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SimulationBanner } from "@/components/SimulationBanner";
import { BoardCard } from "@/components/board/BoardCard";
import { MovePanel, type RosterEntry } from "@/components/board/MovePanel";
import { decideSos } from "@/app/actions/decide-sos";
import { decideReport } from "@/app/actions/decide-report";
import { assignResponder, closeAssignment } from "@/app/actions/assign";
import {
  BOARD_COLUMNS, columnLabel, groupByColumn, moveNeeds,
  type BoardColumn, type BoardRow,
} from "@/lib/board/types";
import { useCopy } from "@/lib/i18n/context";

type Stage = "loading" | "denied" | "failed" | "ready";

/**
 * The master admin's board. Desktop only.
 *
 * Four columns, reports and SOS signals together, through one definer
 * function that unions the two into one shape. Every move is a button on the
 * card (and, from Task 7, a drag); the two moves that need something first -
 * a reason, a person - open a panel that asks for it.
 *
 * What each move calls is the existing decision function for that kind of
 * record. The board invents no new rule: "Hindi totoo" IS decide_sos
 * dismissed / decide_report hide, with the reputation and suspension
 * consequences those already carry; "Kailangan ng atensyon" IS decide_sos
 * confirmed / decide_report confirm; "May nakatalaga" IS assign_responder.
 */
export default function BoardPage() {
  const copy = useCopy();
  const [stage, setStage] = useState<Stage>("loading");
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [panel, setPanel] = useState<{ row: BoardRow; to: BoardColumn } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await createClient().rpc("board_rows");
    if (loadError) {
      // 42501 is the function's own refusal: not the master admin. Anything
      // else is a failure, and the two must not look the same.
      setStage(loadError.code === "42501" ? "denied" : "failed");
      return;
    }
    setRows((data as BoardRow[]) ?? []);
    setStage("ready");
  }, []);

  useEffect(() => {
    void load();
    const channel = createClient()
      .channel("board")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_signals" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "depth_reports" }, () => void load())
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [load]);

  /** Fetched the first time a responder is needed; the roster is short. */
  async function ensureRoster(): Promise<RosterEntry[]> {
    if (roster) return roster;
    const { data } = await createClient().rpc("responder_roster");
    const list = (data as RosterEntry[]) ?? [];
    setRoster(list);
    return list;
  }

  const perform = useCallback(
    async (row: BoardRow, to: BoardColumn, reason: string | null, responderId: string | null) => {
      setError(null);
      let ok: boolean;

      if (to === "not_true") {
        const result =
          row.kind === "sos"
            ? await decideSos(row.id, "dismissed", reason)
            : await decideReport(row.id, "hide", reason);
        ok = result.ok;
      } else if (to === "needs_attention") {
        // From "assigned" this is the responder being done; from anywhere
        // else it is confirmation.
        const result =
          row.board_column === "assigned" && row.assignment_id
            ? await closeAssignment(row.assignment_id)
            : row.kind === "sos"
              ? await decideSos(row.id, "confirmed", null)
              : await decideReport(row.id, "confirm", null);
        ok = result.ok;
      } else if (to === "assigned" && responderId) {
        const result = await assignResponder({ kind: row.kind, id: row.id }, responderId);
        ok = result.ok;
      } else {
        ok = false;
      }

      if (!ok) {
        setError(copy.board.moveFailed);
        return;
      }
      setPanel(null);
      await load();
    },
    [copy.board.moveFailed, load],
  );

  const move = useCallback(
    async (row: BoardRow, to: BoardColumn) => {
      const need = moveNeeds(to);
      if (need === "responder") await ensureRoster();
      if (need) {
        setPanel({ row, to });
        return;
      }
      await perform(row, to, null, null);
    },
    // ensureRoster reads `roster` state; listing it keeps the closure fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perform, roster],
  );

  const grouped = groupByColumn(rows);

  return (
    <>
      <SimulationBanner />
      <main className="board-page">
        <header className="board-head">
          <h1 className="task-title">{copy.board.title}</h1>
          <Link href="/console" className="quiet-link">{copy.board.backToConsole}</Link>
        </header>

        <p className="board-narrow">{copy.board.desktopOnly}</p>

        {stage === "loading" && <p className="task-lede">{copy.board.loading}</p>}
        {stage === "denied" && <p className="task-lede">{copy.board.noAccess}</p>}
        {stage === "failed" && (
          <p className="alert">
            {copy.board.loadFailed}{" "}
            <button type="button" className="btn btn-quiet" onClick={() => void load()}>
              {copy.map.retry}
            </button>
          </p>
        )}

        {error && <p className="alert" role="alert">{error}</p>}

        {stage === "ready" && (
          <div className="board-columns">
            {BOARD_COLUMNS.map((column) => (
              <section key={column} className="board-column" data-column={column}>
                <h2 className="board-column-title">
                  {columnLabel(column, copy.board)}
                  <span className="console-tab-count">{grouped[column].length}</span>
                </h2>
                {grouped[column].length === 0 && (
                  <p className="board-card-meta">{copy.board.columnEmpty}</p>
                )}
                {grouped[column].map((row) => (
                  <BoardCard key={`${row.kind}:${row.id}`} row={row} onMove={(to) => void move(row, to)} />
                ))}
              </section>
            ))}
          </div>
        )}

        {panel && (
          <MovePanel
            row={panel.row}
            to={panel.to}
            roster={roster ?? []}
            onCancel={() => setPanel(null)}
            onConfirm={(reason, responderId) => void perform(panel.row, panel.to, reason, responderId)}
          />
        )}
      </main>
    </>
  );
}
