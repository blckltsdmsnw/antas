import { describe, it, expect } from "vitest";
import {
  HAZARDS, SEVERITIES, PUBLIC_HAZARDS,
  isHazardType, isSeverity, isPublicHazard,
} from "./types";

describe("hazard vocabulary", () => {
  it("lists the six hazards in the order the picker shows them", () => {
    expect([...HAZARDS]).toEqual([
      "flood", "fire", "earthquake", "accident", "medical", "other",
    ]);
  });

  it("rejects what it does not know, whatever the type", () => {
    // The guard sits on a server-action boundary and is handed unknown.
    expect(isHazardType("typhoon")).toBe(false);
    expect(isHazardType("")).toBe(false);
    expect(isHazardType(null)).toBe(false);
    expect(isHazardType(3)).toBe(false);
  });

  it("accepts every hazard it offers", () => {
    for (const h of HAZARDS) expect(isHazardType(h)).toBe(true);
  });

  it("has exactly three severities, worst last", () => {
    expect([...SEVERITIES]).toEqual([1, 2, 3]);
  });

  it("rejects a severity outside the range or of the wrong type", () => {
    expect(isSeverity(0)).toBe(false);
    expect(isSeverity(4)).toBe(false);
    expect(isSeverity(2.5)).toBe(false);
    expect(isSeverity("2")).toBe(false);
    expect(isSeverity(null)).toBe(false);
  });

  it("keeps a person's emergency off the public map", () => {
    // Flood, fire and earthquake describe a place. Accident and medical
    // describe a person, and pinning one to an address exposes somebody at
    // their worst moment to their whole neighbourhood.
    expect([...PUBLIC_HAZARDS]).toEqual(["flood", "fire", "earthquake"]);
    expect(isPublicHazard("medical")).toBe(false);
    expect(isPublicHazard("accident")).toBe(false);
    expect(isPublicHazard("other")).toBe(false);
  });
});
