import { describe, it, expect } from "vitest";
import { SOS_STATUSES } from "./status";
import { isNews, progressFor } from "./progress";

/**
 * These tests are mostly about words, which is unusual and deliberate.
 *
 * This module is the only thing in the product that speaks to somebody who may
 * still be in the water. The failure mode is not a crash - it is a sentence
 * that reads as "help is coming" to a person deciding whether to climb. So the
 * assertions are about what the copy must never say, and they are worth more
 * than the type checking around them.
 */

describe("progressFor", () => {
  it("covers every status the database can produce", () => {
    // A missing key renders as undefined and throws in the component, on the
    // screen where that matters most.
    for (const status of SOS_STATUSES) {
      const progress = progressFor(status);
      expect(progress.headline).toBeTruthy();
      expect(progress.detail).toBeTruthy();
    }
  });

  it("never promises that help is coming", () => {
    // The governing rule of the product, asserted rather than trusted. Antas
    // dispatches nobody, and a line implying otherwise is the one that makes
    // somebody wait instead of climbing or calling 911.
    const promises = [
      /may paparating na tulong\b(?!\.)/i,
      /may susundo sa iyo\b(?!\.)/i,
      /rescuer? (is|na) (on the way|paparating|darating)/i,
      /\d+\s*(minuto|minutes)\b.*\b(darating|dating|arrive)/i,
      /naka-?dispatch/i,
      /hintayin.*(sagip|rescue|tulong)/i,
    ];

    for (const status of SOS_STATUSES) {
      const { headline, detail } = progressFor(status);
      const text = `${headline} ${detail}`;
      for (const promise of promises) {
        expect(text, `${status} must not promise rescue`).not.toMatch(promise);
      }
    }
  });

  it("says a moderator read it, not that a moderator responded", () => {
    const opened = progressFor("under_review");
    expect(opened.headline).toContain("Binuksan");
    // And explicitly disowns the inference a reader would otherwise draw.
    expect(opened.detail).toMatch(/hindi ito nangangahulugang/i);
  });

  it("does not let 'confirmed' read as 'somebody is coming'", () => {
    // The most dangerous of the five: a moderator judging a signal credible is
    // a statement about the signal, not a dispatch, and the word invites the
    // opposite reading.
    const confirmed = progressFor("confirmed");
    expect(confirmed.detail).toMatch(/hindi pa rin/i);
  });

  it("points a dismissed sender at a number that does reach somebody", () => {
    // Being turned down here must not read as being out of options.
    expect(progressFor("dismissed").detail).toContain("911");
  });

  it("marks only the finished states as closed", () => {
    for (const status of ["pending", "under_review", "confirmed"] as const) {
      expect(progressFor(status).open).toBe(true);
    }
    for (const status of ["dismissed", "resolved"] as const) {
      expect(progressFor(status).open).toBe(false);
    }
  });
});

describe("isNews", () => {
  it("treats pending as nothing worth announcing", () => {
    // Every signal starts here and the sender watched it send, so surfacing it
    // as an update would be the product talking about itself.
    expect(isNews("pending")).toBe(false);
  });

  it("treats everything else as somebody having acted", () => {
    for (const status of SOS_STATUSES.filter((s) => s !== "pending")) {
      expect(isNews(status)).toBe(true);
    }
  });
});
