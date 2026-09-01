import { describe, it, expect } from "vitest";
import { scoreSignal } from "./score";
import type { ScoringSnapshot } from "./types";

/** A plausible mid-range signal. Individual tests override one field. */
const baseline: ScoringSnapshot = {
  claimedDepth: "chest",
  hazard: null,
  gpsAccuracyM: 8,
  hasLivePhoto: true,
  photoReusedCount: 0,
  accountAgeMinutes: 60 * 24 * 30,
  reporterConfirmedCount: 0,
  reporterFalseReportCount: 0,
  corroboratingReports: 0,
  rainfall24hMm: 40,
  elevationM: 12,
  surroundingElevationM: 13,
};

/**
 * An SOS stopped asking for a depth, so `claimedDepth` is null on every signal
 * sent since. The danger is that the scorer reads silence as a weak claim and
 * quietly sinks the people who asked for help fastest to the bottom of a
 * moderator's queue - penalising them for a field they were never shown.
 */
describe("scoreSignal with no depth claimed", () => {
  const noClaim: ScoringSnapshot = { ...baseline, claimedDepth: null };

  it("never scores lower than the same signal with a depth", () => {
    const dry = { rainfall24hMm: 0, elevationM: 40, surroundingElevationM: 12 };

    const claimed = scoreSignal({ ...baseline, claimedDepth: "above_head", ...dry });
    const silent = scoreSignal({ ...noClaim, ...dry });

    // Both penalties exist only to contradict a claim. With nothing claimed
    // there is nothing to contradict, so they withdraw.
    expect(silent.score).toBeGreaterThan(claimed.score);
  });

  it("does not hold dry weather against a signal that claimed nothing", () => {
    const result = scoreSignal({ ...noClaim, rainfall24hMm: 0 });

    expect(result.reasons.map((r) => r.text)).not.toContain(
      "No rainfall recorded in 24h.",
    );
  });

  it("does not hold high ground against a signal that claimed nothing", () => {
    const result = scoreSignal({
      ...noClaim,
      elevationM: 40,
      surroundingElevationM: 12,
    });

    expect(result.reasons.some((r) => r.text.includes("above surrounding"))).toBe(
      false,
    );
  });

  it("still rewards the evidence it does have", () => {
    // Silence about depth must not silence everything else: corroboration, a
    // live photo and an accurate fix are all still real evidence.
    const alone = scoreSignal({ ...noClaim, corroboratingReports: 0 });
    const backed = scoreSignal({ ...noClaim, corroboratingReports: 4 });

    expect(backed.score).toBeGreaterThan(alone.score);
  });
});

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

/**
 * A photograph that has been sent before.
 *
 * A live capture of moving water is never byte-identical twice, so a repeat is
 * not weak evidence to weigh - it says the picture is not of what is happening
 * now. The other half of this block matters just as much: a check that could
 * not run must score exactly like a clean one.
 */
describe("scoreSignal with a reused photo", () => {
  it("penalises a photo that came with an earlier signal", () => {
    const fresh = scoreSignal(baseline);
    const reused = scoreSignal({ ...baseline, photoReusedCount: 1 });

    expect(reused.score).toBeLessThan(fresh.score);
    expect(reused.reasons).toContainEqual({
      kind: "concerning",
      text: "This exact photo was sent with an earlier signal.",
    });
  });

  it("counts how many earlier signals shared it", () => {
    const reused = scoreSignal({ ...baseline, photoReusedCount: 4 });
    expect(reused.reasons).toContainEqual({
      kind: "concerning",
      text: "This exact photo was sent with 4 earlier signals.",
    });
  });

  it("treats an unknown result as silence, not as suspicion", () => {
    // THE HALF THAT MATTERS MOST. null means the photo could not be fetched or
    // the signal predates the fingerprint - a gap in the system, never evidence
    // against the person who sent it. Scoring it like a repeat would let a
    // storage hiccup bury a real call for help.
    const unknown = scoreSignal({ ...baseline, photoReusedCount: null });
    const clean = scoreSignal({ ...baseline, photoReusedCount: 0 });

    expect(unknown.score).toBe(clean.score);
    expect(unknown.reasons).toEqual(clean.reasons);
  });

  it("says nothing at all when the photo is unique", () => {
    const clean = scoreSignal({ ...baseline, photoReusedCount: 0 });
    expect(clean.reasons.map((r) => r.text).join(" ")).not.toMatch(/exact photo/i);
  });

  it("still leaves a reused signal in the queue rather than refusing it", () => {
    // The governing rule: scoring orders a queue, it never discards. Even the
    // heaviest penalty in the scorer must not floor a signal out of sight.
    const reused = scoreSignal({ ...baseline, photoReusedCount: 3 });
    expect(reused.score).toBeGreaterThanOrEqual(0);
  });
});

describe("hazard", () => {
  const wet = { rainfall24hMm: 30, elevationM: 10, surroundingElevationM: 15 };

  it("keeps the rainfall and elevation groups for a flood and for an unspecified hazard", () => {
    // Unspecified keeps them: with no claimed depth those two groups can
    // only ever support, and withdrawing support from the people who had no
    // seconds to choose a chip would penalise the product's own design.
    const flood = scoreSignal({ ...baseline, claimedDepth: null, hazard: "flood", ...wet });
    const none = scoreSignal({ ...baseline, claimedDepth: null, hazard: null, ...wet });
    expect(flood.reasons.some((r) => /rainfall/i.test(r.text))).toBe(true);
    expect(none.reasons.some((r) => /rainfall/i.test(r.text))).toBe(true);
  });

  it("withdraws them for a fire, and says so rather than scoring the gap", () => {
    const fire = scoreSignal({ ...baseline, claimedDepth: null, hazard: "fire", ...wet });
    expect(fire.reasons.some((r) => /rainfall/i.test(r.text) && r.kind !== "unknown")).toBe(false);
    expect(fire.reasons.some((r) => /terrain/i.test(r.text))).toBe(false);
    expect(fire.reasons).toContainEqual({
      kind: "unknown",
      text: "Rainfall and elevation checks apply to flood only.",
    });
  });

  it("does not degrade a fire to medium on missing weather, because weather was never asked", () => {
    const fire = scoreSignal({
      ...baseline, claimedDepth: null, hazard: "fire",
      rainfall24hMm: null, elevationM: null, surroundingElevationM: null,
      hasLivePhoto: false, corroboratingReports: 0, reporterFalseReportCount: 2,
    });
    expect(fire.confidence).toBe("low");
  });
});
