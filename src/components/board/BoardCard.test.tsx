import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardCard } from "./BoardCard";
import type { BoardRow } from "@/lib/board/types";

function row(over: Partial<BoardRow>): BoardRow {
  return {
    kind: "report", id: "r1", board_column: "needs_checking",
    hazard_type: "fire", severity: 2, depth: null, barangay: "Malanday",
    status: "active", trust_score: null, confidence: null,
    created_at: new Date().toISOString(), assignment_id: null,
    responder_name: null, responder_unit: null, ...over,
  };
}

describe("BoardCard", () => {
  it("names a fire by hazard and severity word", () => {
    render(<BoardCard row={row({})} onMove={() => {}} />);
    expect(screen.getByText("Sunog · May apoy sa isang bahay")).toBeInTheDocument();
  });

  it("names a flood by its depth", () => {
    render(<BoardCard row={row({ hazard_type: "flood", depth: "waist", severity: 2 })} onMove={() => {}} />);
    expect(screen.getByText("Hanggang baywang")).toBeInTheDocument();
  });

  it("says an SOS with no chip is unspecified, and shows its score", () => {
    render(
      <BoardCard
        row={row({ kind: "sos", hazard_type: null, severity: null, trust_score: 61, confidence: "medium" })}
        onMove={() => {}}
      />,
    );
    expect(screen.getByText("Hindi tinukoy")).toBeInTheDocument();
    expect(screen.getByText(/medium · 61\/100/)).toBeInTheDocument();
  });

  it("offers exactly the moves allowed from its column, as buttons", async () => {
    const onMove = vi.fn();
    render(<BoardCard row={row({ board_column: "needs_attention" })} onMove={onMove} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["→ Hindi totoo", "→ May nakatalaga"]);
    await userEvent.click(buttons[1]);
    expect(onMove).toHaveBeenCalledWith("assigned");
  });

  it("shows who is on it when assigned, and offers to hand it back", () => {
    render(
      <BoardCard
        row={row({ board_column: "assigned", assignment_id: "a1", responder_name: "Cora Dizon", responder_unit: "medical" })}
        onMove={() => {}}
      />,
    );
    expect(screen.getByText("Nakatalaga kay Cora Dizon · Medikal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "→ Kailangan ng atensyon" })).toBeInTheDocument();
  });

  it("offers nothing from not_true", () => {
    render(<BoardCard row={row({ board_column: "not_true" })} onMove={() => {}} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("is draggable, announces what it carries, and reports its lifecycle", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    render(
      <BoardCard row={row({})} onMove={() => {}} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={false} />,
    );
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("draggable", "true");
    const setData = vi.fn();
    fireEvent.dragStart(card, { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith("text/plain", "report:r1");
    expect(onDragStart).toHaveBeenCalled();
    fireEvent.dragEnd(card);
    expect(onDragEnd).toHaveBeenCalled();
  });

  it("is not draggable from not_true, where there is nowhere to go", () => {
    render(<BoardCard row={row({ board_column: "not_true" })} onMove={() => {}} dragging={false} />);
    expect(screen.getByRole("article")).toHaveAttribute("draggable", "false");
  });
});
