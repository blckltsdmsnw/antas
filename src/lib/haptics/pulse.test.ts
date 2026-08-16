import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PULSE_HOLD,
  PULSE_SENT,
  RAMP_HEADROOM_MS,
  patternDurationMs,
  stopPulse,
  vibrate,
} from "./pulse";
import { HOLD_MS } from "@/components/HoldToConfirm";

/**
 * jsdom ships no `navigator.vibrate`, which is the same shape iOS Safari has.
 * That makes the unsupported case the default here rather than a special one -
 * the right way round, since it is the case most of this product's readers are
 * actually in.
 */
function withVibrate(impl: (pattern: number | number[]) => boolean) {
  const spy = vi.fn(impl);
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

describe("vibrate", () => {
  it("is silent, and says so, where the API does not exist", () => {
    // iOS - Safari and every other browser there, since they all run WebKit.
    // Not an error, not a warning: the caller is expected to have a visual
    // channel that works alone, and this returning false is how it learns
    // nothing was felt.
    expect(() => vibrate(PULSE_HOLD)).not.toThrow();
    expect(vibrate(PULSE_HOLD)).toBe(false);
    expect(() => stopPulse()).not.toThrow();
  });

  it("asks the device for exactly the pattern it was handed", () => {
    const spy = withVibrate(() => true);

    expect(vibrate(PULSE_SENT)).toBe(true);
    expect(spy).toHaveBeenCalledWith([...PULSE_SENT]);
  });

  it("does not take the page down when the device refuses", () => {
    // Chrome throws rather than returning false in some contexts - a cross
    // origin frame, a document that has never been interacted with. On the SOS
    // screen an exception here would land inside the submit path.
    const spy = withVibrate(() => {
      throw new Error("vibration blocked");
    });

    expect(vibrate(PULSE_HOLD)).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it("reports a device that declined without throwing", () => {
    withVibrate(() => false);
    expect(vibrate(PULSE_HOLD)).toBe(false);
  });

  it("cancels with a zero, which is how the pattern is cut short", () => {
    const spy = withVibrate(() => true);
    stopPulse();
    expect(spy).toHaveBeenCalledWith(0);
  });
});

describe("the hold ramp", () => {
  it("finishes inside the hold, with room to spare", () => {
    // Two failures in one assertion. Run past HOLD_MS and the phone keeps
    // ticking after the SOS has already fired - the hold saying "still
    // counting" over a signal that has gone. Finish too close to it and the
    // cancel that firing performs clips the ramp's own last beat, which would
    // only ever show up on a phone under load.
    expect(patternDurationMs(PULSE_HOLD)).toBeLessThanOrEqual(
      HOLD_MS - RAMP_HEADROOM_MS,
    );
  });

  it("accelerates rather than keeping time", () => {
    // The gaps are the message. Evenly spaced beats say "something is
    // happening"; closing gaps say "nearly there", which is what the person
    // holding the button actually wants to know and what the progress ring
    // tells anyone who can look at it.
    const gaps = PULSE_HOLD.filter((_, index) => index % 2 === 1);
    expect(gaps.length).toBeGreaterThan(2);
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    }
  });

  it("never beats as long as the confirmation does", () => {
    // The confirming pattern is the only one carrying news, so it must not be
    // confusable with the hold still counting. Its beats are longer than every
    // beat in the ramp; the day that stops being true, the two feel alike.
    const holdBeats = PULSE_HOLD.filter((_, index) => index % 2 === 0);
    const sentBeats = PULSE_SENT.filter((_, index) => index % 2 === 0);
    expect(Math.min(...sentBeats)).toBeGreaterThan(Math.max(...holdBeats));
  });

  it("uses beats long enough for a phone motor to render", () => {
    // Twenty milliseconds shipped first and was felt as nothing; fifty was
    // still reported as too weak. The motor has to spin up and stop again, so
    // short durations arrive faint or get clamped by an amount that depends on
    // the hardware. Eighty is the floor this was retuned to.
    const beats = PULSE_HOLD.filter((_, index) => index % 2 === 0);
    expect(Math.min(...beats)).toBeGreaterThanOrEqual(80);
  });
});
