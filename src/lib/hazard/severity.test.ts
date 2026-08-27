import { describe, it, expect } from "vitest";
import { severityOfDepth, worstSeverity } from "./severity";

describe("severityOfDepth", () => {
  it("maps the five body levels onto three ranks", () => {
    expect(severityOfDepth("ankle")).toBe(1);
    expect(severityOfDepth("knee")).toBe(1);
    expect(severityOfDepth("waist")).toBe(2);
    expect(severityOfDepth("chest")).toBe(3);
    expect(severityOfDepth("above_head")).toBe(3);
  });

  it("keeps today's priority behaviour for flood", () => {
    // report_priority() called a report urgent at chest or deeper. Those are
    // exactly the depths that map to 3, so the bands are preserved rather
    // than re-tuned when the function switches from depth to severity.
    expect(severityOfDepth("chest")).toBe(3);
    expect(severityOfDepth("waist")).toBeLessThan(3);
  });
});

describe("worstSeverity", () => {
  it("takes the worst member, never an average", () => {
    expect(worstSeverity([1, 1, 1, 3])).toBe(3);
    expect(worstSeverity([1, 2])).toBe(2);
  });

  it("returns 1 for an empty list", () => {
    expect(worstSeverity([])).toBe(1);
  });
});
