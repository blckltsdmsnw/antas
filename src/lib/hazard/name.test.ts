import { describe, it, expect } from "vitest";
import { copyFor } from "@/lib/i18n/strings";
import { HAZARDS, SEVERITIES } from "./types";
import { hazardName, severityWord } from "./name";

const tl = copyFor("tl").hazard;
const en = copyFor("en").hazard;

describe("hazard strings", () => {
  it("names every hazard in both languages", () => {
    for (const h of HAZARDS) {
      expect(hazardName(h, tl)).toBeTruthy();
      expect(hazardName(h, en)).toBeTruthy();
    }
  });

  it("gives every non-flood hazard three severity words in both languages", () => {
    for (const h of HAZARDS) {
      if (h === "flood") continue;
      for (const s of SEVERITIES) {
        expect(severityWord(h, s, tl)).toBeTruthy();
        expect(severityWord(h, s, en)).toBeTruthy();
      }
    }
  });

  it("uses the body scale for flood rather than a severity word", () => {
    // Flood's words live in copy.map as depthAnkle..depthAboveHead. Asking
    // this lookup for a flood severity is a caller mistake, and the answer
    // must not silently be a fire's word.
    expect(() => severityWord("flood", 2, tl)).toThrow();
  });

  it("keeps the three words distinct within a hazard, in both languages", () => {
    for (const h of HAZARDS) {
      if (h === "flood") continue;
      for (const c of [tl, en]) {
        const words = new Set(SEVERITIES.map((s) => severityWord(h, s, c)));
        expect(words.size).toBe(3);
      }
    }
  });
});
