import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HazardPicker } from "./HazardPicker";

describe("HazardPicker", () => {
  it("offers all six hazards as buttons", () => {
    render(<HazardPicker onPick={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("reports the hazard that was tapped", async () => {
    const onPick = vi.fn();
    render(<HazardPicker onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: /sunog/i }));
    expect(onPick).toHaveBeenCalledWith("fire");
  });

  it("preselects nothing", () => {
    // A default hazard would be a guess put in somebody's mouth. The first
    // tap must be a choice.
    const onPick = vi.fn();
    render(<HazardPicker onPick={onPick} />);
    expect(onPick).not.toHaveBeenCalled();
  });
});
