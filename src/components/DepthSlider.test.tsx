import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DepthSlider } from "./DepthSlider";

describe("DepthSlider", () => {
  it("shows the Filipino label for the selected level", () => {
    render(<DepthSlider value="knee" onChange={() => {}} />);
    expect(screen.getByText("Hanggang tuhod")).toBeInTheDocument();
  });

  it("shows the English label alongside it", () => {
    render(<DepthSlider value="knee" onChange={() => {}} />);
    expect(screen.getByText("Knee-deep")).toBeInTheDocument();
  });

  it("reports the new level when the slider moves", () => {
    // jsdom does not faithfully translate keyboard interaction on
    // <input type="range"> into a change event (userEvent.click +
    // {ArrowRight} never fires onChange here, even though the same
    // interaction works in real browsers). fireEvent.change simulates
    // the resulting DOM event directly so this test still verifies the
    // behavior that matters: moving the slider one step deeper from
    // "ankle" must report "knee" to the parent.
    const onChange = vi.fn();
    render(<DepthSlider value="ankle" onChange={onChange} />);

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "1" } });

    expect(onChange).toHaveBeenCalledWith("knee");
  });

  it("exposes the level name to assistive technology", () => {
    render(<DepthSlider value="chest" onChange={() => {}} />);
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "Hanggang dibdib",
    );
  });
});
