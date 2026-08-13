import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { HoldToConfirm } from "./HoldToConfirm";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("HoldToConfirm", () => {
  it("does not fire on a quick tap", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerUp(button);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("fires only after the full hold", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    fireEvent.pointerDown(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels when the finger lifts early", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.pointerUp(button);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("exposes progress to assistive technology", () => {
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={() => {}} />);
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(Number(button.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });
});
