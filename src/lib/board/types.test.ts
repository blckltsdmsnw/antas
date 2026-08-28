import { describe, it, expect } from "vitest";
import { copyFor } from "@/lib/i18n/strings";
import {
  BOARD_COLUMNS, isBoardColumn, movesFrom, canMove, moveNeeds,
  columnLabel, groupByColumn, findLive, type BoardRow,
} from "./types";

const tl = copyFor("tl").board;
const en = copyFor("en").board;

function row(over: Partial<BoardRow>): BoardRow {
  return {
    kind: "report", id: "r1", board_column: "needs_checking",
    hazard_type: "flood", severity: 1, depth: "ankle", barangay: "Malanday",
    status: "active", trust_score: null, confidence: null,
    created_at: "2026-08-28T00:00:00Z", assignment_id: null,
    responder_name: null, responder_unit: null, ...over,
  };
}

describe("board columns", () => {
  it("are four, in the order the board draws them", () => {
    expect([...BOARD_COLUMNS]).toEqual([
      "needs_checking", "not_true", "needs_attention", "assigned",
    ]);
  });

  it("have a label in both languages", () => {
    for (const c of BOARD_COLUMNS) {
      expect(columnLabel(c, tl)).toBeTruthy();
      expect(columnLabel(c, en)).toBeTruthy();
    }
  });

  it("rejects what it does not know", () => {
    expect(isBoardColumn("dispatched")).toBe(false);
    expect(isBoardColumn(null)).toBe(false);
  });
});

describe("moves", () => {
  it("follow the spec's arrows from needs_checking", () => {
    expect([...movesFrom("needs_checking")]).toEqual([
      "not_true", "needs_attention", "assigned",
    ]);
  });

  it("let an assigned record be handed back or declared not true", () => {
    expect(canMove("assigned", "needs_attention")).toBe(true);
    expect(canMove("assigned", "not_true")).toBe(true);
    expect(canMove("assigned", "needs_checking")).toBe(false);
  });

  it("leave not_true as a terminal column", () => {
    expect(movesFrom("not_true")).toEqual([]);
  });

  it("never move a record onto its own column", () => {
    for (const c of BOARD_COLUMNS) expect(canMove(c, c)).toBe(false);
  });

  it("say what a move has to ask for first", () => {
    // Not true needs a reason: for an SOS this is the path that raises
    // false_report_count, and a drag must never quietly cost somebody their
    // account. Assigned needs a person, because the column asserts one.
    expect(moveNeeds("not_true")).toBe("reason");
    expect(moveNeeds("assigned")).toBe("responder");
    expect(moveNeeds("needs_attention")).toBeNull();
    expect(moveNeeds("needs_checking")).toBeNull();
  });
});

describe("findLive", () => {
  it("returns the live row - its current board_column, not the snapshot's", () => {
    const snapshot = row({ id: "a", board_column: "needs_checking" });
    const rows = [row({ id: "a", board_column: "needs_attention" }), row({ id: "b" })];
    expect(findLive(rows, snapshot)).toEqual(rows[0]);
  });

  it("returns null when the row is absent, and when dragging is null", () => {
    const rows = [row({ id: "b" })];
    expect(findLive(rows, row({ id: "a" }))).toBeNull();
    expect(findLive(rows, null)).toBeNull();
  });
});

describe("groupByColumn", () => {
  it("returns every column, empty ones included, in server order", () => {
    const rows = [
      row({ id: "a", board_column: "assigned" }),
      row({ id: "b", board_column: "needs_checking" }),
      row({ id: "c", board_column: "needs_checking" }),
    ];
    const grouped = groupByColumn(rows);
    expect(Object.keys(grouped)).toEqual([...BOARD_COLUMNS]);
    expect(grouped.needs_checking.map((r) => r.id)).toEqual(["b", "c"]);
    expect(grouped.not_true).toEqual([]);
    expect(grouped.assigned.map((r) => r.id)).toEqual(["a"]);
  });
});
