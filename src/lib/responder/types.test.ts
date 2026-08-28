import { describe, it, expect } from "vitest";
import { copyFor } from "@/lib/i18n/strings";
import { RESPONDER_UNITS, isResponderUnit, unitLabel } from "./types";

describe("responder units", () => {
  it("match the responder_unit enum in 0032", () => {
    expect([...RESPONDER_UNITS]).toEqual([
      "bfp", "barangay_rescue", "medical", "police", "other",
    ]);
  });

  it("have a label in both languages", () => {
    for (const u of RESPONDER_UNITS) {
      expect(unitLabel(u, copyFor("tl").board)).toBeTruthy();
      expect(unitLabel(u, copyFor("en").board)).toBeTruthy();
    }
  });

  it("rejects the unknown", () => {
    expect(isResponderUnit("navy")).toBe(false);
    expect(isResponderUnit(undefined)).toBe(false);
  });
});
