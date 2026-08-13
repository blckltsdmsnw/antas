import { describe, it, expect } from "vitest";
import { scoreSignal } from "./score";
import type { ScoringSnapshot } from "./types";

/** A plausible mid-range signal. Individual tests override one field. */
const baseline: ScoringSnapshot = {
  claimedDepth: "chest",
  gpsAccuracyM: 8,
  hasLivePhoto: true,
  accountAgeMinutes: 60 * 24 * 30,
  reporterConfirmedCount: 0,
  reporterFalseReportCount: 0,
  corroboratingReports: 0,
  rainfall24hMm: 40,
  elevationM: 12,
  surroundingElevationM: 13,
};

describe("scoreSignal", () => {
  it("scores a corroborated, plausible signal as high confidence", () => {
    const result = scoreSignal({
      ...baseline,
      corroboratingReports: 4,
      reporterConfirmedCount: 3,
      rainfall24hMm: 82,
    });

    expect(result.confidence).toBe("high");
    expect(result.reasons.some((r) => r.kind === "supporting")).toBe(true);
  });

  it("flags a deep claim on high ground with no rainfall", () => {
    const result = scoreSignal({
      ...baseline,
      claimedDepth: "above_head",
      rainfall24hMm: 0,
      elevationM: 55,
      surroundingElevationM: 15,
      corroboratingReports: 0,
    });

    expect(result.confidence).toBe("low");
    expect(
      result.reasons.some(
        (r) => r.kind === "concerning" && /above surrounding terrain/.test(r.text),
      ),
    ).toBe(true);
    expect(
      result.reasons.some(
        (r) => r.kind === "concerning" && /No rainfall/.test(r.text),
      ),
    ).toBe(true);
  });

  it("notes a brand-new account without silencing it", () => {
    const result = scoreSignal({ ...baseline, accountAgeMinutes: 6 });

    expect(
      result.reasons.some((r) => /Account created 6 minutes ago/.test(r.text)),
    ).toBe(true);
    // Never zero: a new account is a caveat, not a disqualification.
    expect(result.score).toBeGreaterThan(0);
  });

  it("degrades toward caution when environmental data is missing", () => {
    const withData = scoreSignal(baseline);
    const withoutData = scoreSignal({
      ...baseline,
      rainfall24hMm: null,
      elevationM: null,
      surroundingElevationM: null,
    });

    // Missing data must never push a signal DOWN the queue.
    expect(withoutData.confidence).not.toBe("low");
    expect(
      withoutData.reasons.some(
        (r) => r.kind === "unknown" && /unavailable/.test(r.text),
      ),
    ).toBe(true);
    expect(withoutData.score).toBeGreaterThanOrEqual(
      Math.min(withData.score, 40),
    );
  });

  it("counts corroboration as support", () => {
    const alone = scoreSignal({ ...baseline, corroboratingReports: 0 });
    const backed = scoreSignal({ ...baseline, corroboratingReports: 5 });

    expect(backed.score).toBeGreaterThan(alone.score);
    expect(
      backed.reasons.some((r) => /Corroborated by 5 nearby/.test(r.text)),
    ).toBe(true);
  });

  it("weighs a history of false reports against a signal", () => {
    const clean = scoreSignal(baseline);
    const liar = scoreSignal({ ...baseline, reporterFalseReportCount: 3 });

    expect(liar.score).toBeLessThan(clean.score);
    expect(liar.score).toBeGreaterThan(0);
  });

  it("treats a missing photo as weaker evidence", () => {
    const withPhoto = scoreSignal(baseline);
    const without = scoreSignal({ ...baseline, hasLivePhoto: false });

    expect(without.score).toBeLessThan(withPhoto.score);
  });

  it("always clamps between 0 and 100", () => {
    const best = scoreSignal({
      ...baseline,
      corroboratingReports: 50,
      reporterConfirmedCount: 50,
      rainfall24hMm: 500,
    });
    const worst = scoreSignal({
      ...baseline,
      reporterFalseReportCount: 50,
      hasLivePhoto: false,
      gpsAccuracyM: 5000,
      accountAgeMinutes: 0,
      rainfall24hMm: 0,
      elevationM: 90,
      surroundingElevationM: 10,
    });

    expect(best.score).toBeLessThanOrEqual(100);
    expect(worst.score).toBeGreaterThanOrEqual(0);
  });

  it("always produces at least one reason", () => {
    expect(scoreSignal(baseline).reasons.length).toBeGreaterThan(0);
  });
});
