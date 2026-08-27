import { describe, it, expect } from "vitest";
import { copyFor } from "@/lib/i18n/strings";
import { DEPTH_LEVELS } from "@/lib/depth/scale";
import { passabilityOfDepth, passabilityLabel, type Passability } from "./mmda";

const tl = copyFor("tl").map;
const en = copyFor("en").map;

describe("passabilityOfDepth", () => {
  it("maps every depth level to its documented MMDA category", () => {
    expect(passabilityOfDepth("ankle")).toBe("PATV");
    expect(passabilityOfDepth("knee")).toBe("NPLV");
    expect(passabilityOfDepth("waist")).toBe("NPATV");
    expect(passabilityOfDepth("chest")).toBe("NPATV");
    expect(passabilityOfDepth("above_head")).toBe("NPATV");
  });

  it("holds the straddle rule at the ankle/knee boundary: knee is NPLV, not PATV", () => {
    // Antas's `knee` band runs 16-50cm. MMDA's PATV ceiling is 25.4cm
    // (half-knee deep), so most of the knee band is already past it - the
    // worse category, NPLV, is the one that must be reported.
    expect(passabilityOfDepth("knee")).not.toBe("PATV");
    expect(passabilityOfDepth("knee")).toBe("NPLV");
  });

  it("holds the straddle rule at the knee/waist boundary: waist is NPATV, not NPLV", () => {
    // Antas's `waist` band runs 51-100cm, straddling MMDA's NPLV ceiling
    // (48.3cm) and its NPATV floor (66cm) - the worse category wins.
    expect(passabilityOfDepth("waist")).not.toBe("NPLV");
    expect(passabilityOfDepth("waist")).toBe("NPATV");
  });

  it("covers every depth level with a valid category", () => {
    const valid: Passability[] = ["PATV", "NPLV", "NPATV"];
    for (const level of DEPTH_LEVELS) {
      expect(valid).toContain(passabilityOfDepth(level));
    }
  });
});

describe("passabilityLabel", () => {
  it("gives every category a label in both languages", () => {
    const categories: Passability[] = ["PATV", "NPLV", "NPATV"];
    for (const category of categories) {
      expect(passabilityLabel(category, tl)).toBeTruthy();
      expect(passabilityLabel(category, en)).toBeTruthy();
    }
  });

  it("gives every depth level's category a label in both languages", () => {
    for (const level of DEPTH_LEVELS) {
      const category = passabilityOfDepth(level);
      expect(passabilityLabel(category, tl)).toBeTruthy();
      expect(passabilityLabel(category, en)).toBeTruthy();
    }
  });
});
