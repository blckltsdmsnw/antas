import { describe, it, expect, vi, afterEach } from "vitest";
import { PULSE_BEGUN, PULSE_SENT, vibrate } from "./pulse";

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
    // iOS Safari. Not an error, not a warning - the caller is expected to have
    // a visual channel that works alone, and this returning false is how it
    // learns nothing was felt.
    expect(() => vibrate(PULSE_BEGUN)).not.toThrow();
    expect(vibrate(PULSE_BEGUN)).toBe(false);
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

    expect(vibrate(PULSE_BEGUN)).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it("reports a device that declined without throwing", () => {
    withVibrate(() => false);
    expect(vibrate(PULSE_BEGUN)).toBe(false);
  });

  it("keeps 'begun' and 'sent' tellable apart by feel", () => {
    // The whole value of the second buzz is that it is not the first one. One
    // beat means the press registered; more than one means the signal went.
    // Flatten them to the same shape and the haptic channel stops carrying any
    // information at all, which nothing on screen would reveal.
    expect(typeof PULSE_BEGUN).toBe("number");
    expect(PULSE_SENT.length).toBeGreaterThan(1);
  });
});
