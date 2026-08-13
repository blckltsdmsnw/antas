import { describe, it, expect } from "vitest";
import {
  clampOffset,
  clampScale,
  pinchScale,
  MAX_SCALE,
  MIN_SCALE,
} from "./zoom";

describe("clampScale", () => {
  it("keeps ordinary values untouched", () => {
    expect(clampScale(2)).toBe(2);
  });

  it("never zooms out past the fitted size", () => {
    // Below 1 the image would float in the middle of the overlay with gaps
    // around it, which reads as a broken layout rather than as zoomed out.
    expect(clampScale(0.4)).toBe(MIN_SCALE);
  });

  it("stops at a useful ceiling rather than pixel soup", () => {
    expect(clampScale(99)).toBe(MAX_SCALE);
  });
});

describe("pinchScale", () => {
  it("scales in proportion to the change in finger distance", () => {
    // Fingers moved twice as far apart, from a starting scale of 1.
    expect(pinchScale(1, 100, 200)).toBe(2);
  });

  it("shrinks when the fingers come together", () => {
    expect(pinchScale(2, 200, 100)).toBe(1);
  });

  it("obeys the same limits as any other zoom", () => {
    expect(pinchScale(3, 100, 900)).toBe(MAX_SCALE);
    expect(pinchScale(1, 900, 100)).toBe(MIN_SCALE);
  });

  it("survives a zero starting distance", () => {
    // Two pointers landing on the exact same pixel is rare but not impossible,
    // and dividing by it would produce Infinity and a blank screen.
    expect(pinchScale(2, 0, 150)).toBe(2);
  });
});

describe("clampOffset", () => {
  const viewport = { width: 400, height: 800 };

  it("pins a fitted image dead centre", () => {
    // At scale 1 there is no slack, so any drag must resolve back to zero.
    expect(clampOffset({ x: 120, y: -80 }, 1, viewport)).toEqual({ x: 0, y: 0 });
  });

  it("allows panning within the overflow once zoomed", () => {
    // At 2x the image is 800x1600, so 200px of slack each way horizontally.
    expect(clampOffset({ x: 150, y: 300 }, 2, viewport)).toEqual({
      x: 150,
      y: 300,
    });
  });

  it("stops the image being dragged off screen", () => {
    // Past the slack the image would leave empty space at one edge.
    expect(clampOffset({ x: 999, y: 999 }, 2, viewport)).toEqual({
      x: 200,
      y: 400,
    });
    expect(clampOffset({ x: -999, y: -999 }, 2, viewport)).toEqual({
      x: -200,
      y: -400,
    });
  });
});
