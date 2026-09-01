// src/components/HazardChips.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HazardChips } from "./HazardChips";

describe("HazardChips", () => {
  it("offers the six hazards with nothing chosen", () => {
    render(<HazardChips value={null} onChange={() => {}} />);
    const chips = screen.getAllByRole("radio");
    expect(chips.map((c) => c.getAttribute("aria-checked"))).toEqual(Array(6).fill("false"));
    expect(screen.getByText("Ano ang nangyayari? (opsyonal)")).toBeInTheDocument();
  });

  it("reports a choice", async () => {
    const onChange = vi.fn();
    render(<HazardChips value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Sunog" }));
    expect(onChange).toHaveBeenCalledWith("fire");
  });

  it("tapping the chosen chip again clears it - none is a real answer", async () => {
    const onChange = vi.fn();
    render(<HazardChips value="fire" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Sunog" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Sunog" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
