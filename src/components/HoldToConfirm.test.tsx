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

  it("exposes progress on an element that can actually carry it", () => {
    // This test used to read aria-valuenow off the BUTTON, and passed while
    // announcing nothing: those attributes are unsupported on role=button,
    // which a <button> has implicitly, so screen readers discarded them. The
    // assertion has to name the role that accepts them, or it re-enshrines the
    // bug it was written to catch.
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={() => {}} />);

    fireEvent.pointerDown(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    const meter = screen.getByRole("progressbar");
    expect(Number(meter.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    expect(screen.getByRole("button").hasAttribute("aria-valuenow")).toBe(false);
  });
});

/**
 * The keyboard path, which did not exist.
 *
 * The control listened only for pointer events, so somebody using a keyboard, a
 * switch or voice control could focus it, press it, and have nothing happen -
 * on the one control in this product that calls for help.
 */
describe("HoldToConfirm by keyboard", () => {
  for (const key of [" ", "Enter"]) {
    it(`fires after a full hold of ${key === " " ? "Space" : key}`, () => {
      const onConfirm = vi.fn();
      render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

      const button = screen.getByRole("button");
      fireEvent.keyDown(button, { key });
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  }

  it("does not fire on a quick press", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: " " });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.keyUp(button, { key: " " });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("survives key auto-repeat", () => {
    // Holding a key fires keydown over and over. Without a guard each repeat
    // restarts the three seconds, so the hold can never complete - and it fails
    // looking exactly like a control that simply does nothing.
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    const button = screen.getByRole("button");
    for (let tick = 0; tick < 30; tick += 1) {
      fireEvent.keyDown(button, { key: " ", repeat: tick > 0 });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores keys that do not activate a button", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    fireEvent.keyDown(screen.getByRole("button"), { key: "a" });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancels if focus leaves mid-hold", () => {
    // Otherwise a timer keeps running behind a control that no longer has
    // focus, and an SOS goes out after the user has moved on.
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: " " });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.blur(button);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
