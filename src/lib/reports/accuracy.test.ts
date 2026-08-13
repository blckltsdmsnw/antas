import { describe, it, expect } from "vitest";
import {
  CONFIRM_ACCURACY_M,
  formatAccuracy,
  needsLocationConfirmation,
} from "./accuracy";

describe("needsLocationConfirmation", () => {
  it("accepts a good phone GPS fix without asking", () => {
    expect(needsLocationConfirmation(8)).toBe(false);
    expect(needsLocationConfirmation(120)).toBe(false);
  });

  it("asks when the fix is worse than the threshold", () => {
    expect(needsLocationConfirmation(CONFIRM_ACCURACY_M + 1)).toBe(true);
    // The real case that prompted this: a desktop browser with no GPS.
    expect(needsLocationConfirmation(100_000)).toBe(true);
  });

  it("asks when accuracy is unknown", () => {
    // Absence of a number is not a good number.
    expect(needsLocationConfirmation(null)).toBe(true);
  });

  it("does not ask exactly at the threshold", () => {
    expect(needsLocationConfirmation(CONFIRM_ACCURACY_M)).toBe(false);
  });
});

describe("formatAccuracy", () => {
  it("uses metres below a kilometre", () => {
    expect(formatAccuracy(8)).toBe("8 m");
    expect(formatAccuracy(950)).toBe("950 m");
  });

  it("switches to kilometres above that", () => {
    expect(formatAccuracy(1500)).toBe("1.5 km");
    expect(formatAccuracy(100_000)).toBe("100 km");
  });

  it("drops the decimal once the number is large", () => {
    expect(formatAccuracy(24_000)).toBe("24 km");
  });

  it("says so plainly when accuracy is unknown", () => {
    expect(formatAccuracy(null)).toBe("hindi alam");
  });
});
