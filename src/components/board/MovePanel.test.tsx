import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MovePanel } from "./MovePanel";
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

const roster = [
  { user_id: "u1", name: "Ana Reyes", unit: "bfp", barangay: "Malanday", phone: "+639171234567" },
  { user_id: "u2", name: "Ben Cruz", unit: "police", barangay: null, phone: null },
];

describe("MovePanel to not_true", () => {
  it("asks for a report reason from the hide vocabulary and refuses without one", async () => {
    const onConfirm = vi.fn();
    render(<MovePanel row={row({})} to="not_true" roster={[]} onCancel={() => {}} onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Bakit hindi totoo?");
    const confirm = screen.getByRole("button", { name: "Ilipat" });
    expect(confirm).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole("combobox"), "stale");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("stale", null);
  });

  it("asks for an SOS reason from the dismiss vocabulary", async () => {
    render(<MovePanel row={row({ kind: "sos" })} to="not_true" roster={[]} onCancel={() => {}} onConfirm={() => {}} />);
    const options = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("false_report");
    expect(options).not.toContain("stale");
  });
});

describe("MovePanel to assigned", () => {
  it("lists the roster and confirms with the chosen person", async () => {
    const onConfirm = vi.fn();
    render(<MovePanel row={row({})} to="assigned" roster={roster} onCancel={() => {}} onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Sino ang itatalaga?");
    const confirm = screen.getByRole("button", { name: "Italaga" });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /Ana Reyes/ }));
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(null, "u1");
  });

  it("says so when nobody is registered", () => {
    render(<MovePanel row={row({})} to="assigned" roster={[]} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/Wala pang nakarehistrong responder/)).toBeInTheDocument();
  });

  it("cancels on Escape", async () => {
    const onCancel = vi.fn();
    render(<MovePanel row={row({})} to="assigned" roster={roster} onCancel={onCancel} onConfirm={() => {}} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });
});
