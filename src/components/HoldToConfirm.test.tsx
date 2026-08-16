import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { HoldToConfirm } from "./HoldToConfirm";
import { PULSE_BEGUN } from "@/lib/haptics/pulse";

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
 * The buzz.
 *
 * Two things are being pinned, and the second matters more than the first. One
 * beat when the press registers - and NOTHING when the three seconds complete,
 * because at that instant the signal has not been written and may still fail on
 * upload or insert. A confirming buzz for an SOS that never sent is the harm
 * `design.md` §12 refuses in the notification channel, and nothing on screen
 * would reveal it: the page looks identical either way.
 */
describe("HoldToConfirm haptics", () => {
  function stubVibrate() {
    const spy = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      value: spy,
      configurable: true,
      writable: true,
    });
    return spy;
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("buzzes once when the press registers", () => {
    const buzz = stubVibrate();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={() => {}} />);

    fireEvent.pointerDown(screen.getByRole("button"));

    expect(buzz).toHaveBeenCalledTimes(1);
    // Read from the module rather than written out here. The duration is tuned
    // against real hardware and has already been raised once; a literal in this
    // file would just have to be chased.
    expect(buzz).toHaveBeenCalledWith(PULSE_BEGUN);
  });

  it("stays silent when the hold completes", () => {
    const buzz = stubVibrate();
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    fireEvent.pointerDown(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Still just the opening beat. Confirming the send is the page's job,
    // after the row exists.
    expect(buzz).toHaveBeenCalledTimes(1);
  });

  it("does not buzz again when the finger lifts early", () => {
    const buzz = stubVibrate();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={() => {}} />);

    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    fireEvent.pointerUp(button);

    expect(buzz).toHaveBeenCalledTimes(1);
  });

  it("does not stutter under key auto-repeat", () => {
    // Every repeat calls start(). Without the timer guard the phone would
    // buzz twenty times in three seconds, which reads as a malfunction on the
    // one control nobody can afford to distrust.
    const buzz = stubVibrate();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={() => {}} />);

    const button = screen.getByRole("button");
    for (let tick = 0; tick < 20; tick += 1) {
      fireEvent.keyDown(button, { key: " ", repeat: tick > 0 });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }

    expect(buzz).toHaveBeenCalledTimes(1);
  });

  it("works on a phone that cannot vibrate at all", () => {
    // iOS Safari. The hold must behave exactly as it always has.
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    fireEvent.pointerDown(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
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
