import type { DepthLevel } from "@/lib/depth/scale";
import type { HazardType, Severity } from "@/lib/hazard/types";
import type { Copy } from "@/lib/i18n/strings";
import type { ResponderUnit } from "@/lib/responder/types";

/**
 * The master admin's four columns, in the order the board draws them.
 *
 * Kailangang suriin -> Hindi totoo | Kailangan ng atensyon -> May nakatalaga.
 * The fourth is not a stored state: `board_rows()` (0033) derives it from an
 * open row in `assignments`, so "assigned" can never disagree with the
 * assignment that makes it true.
 */
export const BOARD_COLUMNS = [
  "needs_checking",
  "not_true",
  "needs_attention",
  "assigned",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export type BoardKind = "sos" | "report";

/** One row of `board_rows()`. */
export interface BoardRow {
  kind: BoardKind;
  id: string;
  board_column: BoardColumn;
  /** Null on an SOS whose sender chose no chip. */
  hazard_type: HazardType | null;
  /** Null on every SOS: a person asking for help is not ranked 1-3. */
  severity: Severity | null;
  depth: DepthLevel | null;
  barangay: string | null;
  status: string;
  trust_score: number | null;
  confidence: string | null;
  created_at: string;
  assignment_id: string | null;
  responder_name: string | null;
  responder_unit: ResponderUnit | null;
}

/**
 * Where a card may go from each column.
 *
 * `assigned` -> `needs_attention` is "the responder is done": it closes the
 * assignment and the record falls back to needing attention, which is what
 * it was. `assigned` -> `not_true` is allowed because the master admin may
 * learn it was false after sending someone; the decision functions close
 * the assignment on the way. `not_true` is terminal on the board - undoing
 * a dismissal is not a drag.
 */
const MOVES: Readonly<Record<BoardColumn, readonly BoardColumn[]>> = Object.freeze({
  needs_checking: ["not_true", "needs_attention", "assigned"],
  not_true: [],
  needs_attention: ["not_true", "assigned"],
  assigned: ["needs_attention", "not_true"],
});

/**
 * What a move must collect before it can happen. A reason before "not true"
 * - for an SOS that is the path that raises false_report_count, and a drag
 * must never quietly cost somebody their account. A person before
 * "assigned", because the column asserts one.
 */
const NEEDS: Readonly<Record<BoardColumn, "reason" | "responder" | null>> = Object.freeze({
  needs_checking: null,
  not_true: "reason",
  needs_attention: null,
  assigned: "responder",
});

const LABEL_KEY: Readonly<Record<BoardColumn, keyof Copy["board"]>> = Object.freeze({
  needs_checking: "colNeedsChecking",
  not_true: "colNotTrue",
  needs_attention: "colNeedsAttention",
  assigned: "colAssigned",
});

export function isBoardColumn(value: unknown): value is BoardColumn {
  return typeof value === "string" && (BOARD_COLUMNS as readonly string[]).includes(value);
}

export function movesFrom(from: BoardColumn): readonly BoardColumn[] {
  return MOVES[from];
}

export function canMove(from: BoardColumn, to: BoardColumn): boolean {
  return MOVES[from].includes(to);
}

export function moveNeeds(to: BoardColumn): "reason" | "responder" | null {
  return NEEDS[to];
}

export function columnLabel(column: BoardColumn, copy: Copy["board"]): string {
  return copy[LABEL_KEY[column]] as string;
}

/**
 * Rows into columns, keeping the server's order inside each. Every column
 * is present even when empty, so the board always draws four.
 */
export function groupByColumn(rows: readonly BoardRow[]): Record<BoardColumn, BoardRow[]> {
  const grouped = Object.fromEntries(
    BOARD_COLUMNS.map((c) => [c, [] as BoardRow[]]),
  ) as Record<BoardColumn, BoardRow[]>;
  for (const r of rows) grouped[r.board_column] = [...grouped[r.board_column], r];
  return grouped;
}
