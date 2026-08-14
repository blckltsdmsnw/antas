import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DepthSlider } from "./DepthSlider";

/**
 * The control changed shape - from an <input type="range"> with a decorative
 * label column, to a list of buttons with a decorative figure. The two tests
 * that asserted `role="slider"` and `aria-valuetext` went with it, because
 * those were properties of the range input rather than of the behaviour.
 *
 * What is asserted instead is what has to stay true whatever the control looks
 * like: every level is individually reachable, choosing one reports it, and the
 * current one is announced rather than only coloured.
 */
describe("DepthSlider", () => {
  it("shows the Filipino label for the selected level", () => {
    render(<DepthSlider value="knee" onChange={() => {}} />);
    expect(screen.getByText("Hanggang tuhod")).toBeInTheDocument();
  });

  it("shows the English label alongside it", () => {
    render(<DepthSlider value="knee" onChange={() => {}} />);
    expect(screen.getByText("Knee-deep")).toBeInTheDocument();
  });

  it("offers every level as its own control", () => {
    render(<DepthSlider value="ankle" onChange={() => {}} />);
    // Five, and reachable individually - the whole reason the figure is not
    // the only way to set this.
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("reports the level that was chosen", () => {
    const onChange = vi.fn();
    render(<DepthSlider value="ankle" onChange={onChange} />);

    screen.getByRole("button", { name: "Tuhod" }).click();

    expect(onChange).toHaveBeenCalledWith("knee");
  });

  it("tells assistive technology which level is selected", () => {
    render(<DepthSlider value="chest" onChange={() => {}} />);

    // Colour alone cannot say "this is the one", so the state is in the
    // accessibility tree as well.
    expect(screen.getByRole("button", { name: "Dibdib" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Tuhod" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("lists the deepest level first, so the scale reads worst-case down", () => {
    render(<DepthSlider value="knee" onChange={() => {}} />);
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual([
      "Lampas sa ulo",
      "Dibdib",
      "Baywang",
      "Tuhod",
      "Bukong-bukong",
    ]);
  });
});
