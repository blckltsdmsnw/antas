import { describe, it, expect } from "vitest";
import { SOS_STATUSES } from "./status";
import { isNews, progressFor, progressText } from "./progress";
import { copyFor } from "@/lib/i18n/strings";

/**
 * These tests are mostly about words, which is unusual and deliberate.
 *
 * This module is the only thing in the product that speaks to somebody who may
 * still be in the water. The failure mode is not a crash - it is a sentence
 * that reads as "help is coming" to a person deciding whether to climb. So the
 * assertions are about what the copy must never say, and they are worth more
 * than the type checking around them.
 *
 * Every one of them now runs in BOTH languages. A natural-sounding English
 * translation is exactly how "sinuri ito" becomes "help has been dispatched":
 * the sentence would look fine to anybody reviewing the English on its own, and
 * only reading it against this rule catches it.
 */

const tl = copyFor("tl").sos;
const en = copyFor("en").sos;

describe.each([
  ["tl", tl],
  ["en", en],
] as const)("progressFor (%s)", (_lang, copy) => {
  it("covers every status the database can produce", () => {
    // A missing key renders as undefined and throws in the component, on the
    // screen where that matters most.
    for (const status of SOS_STATUSES) {
      const progress = progressText(status, copy);
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
      // The English ways of saying the same forbidden thing.
      /help is (on the way|coming)(?!\.)/i,
      /(rescue|responder|someone) (is|has been) (dispatched|sent|on the way)/i,
      /(wait|stay put|stay where you are) (for|until)/i,
      /will (arrive|reach you|come for you)/i,
    ];

    for (const status of SOS_STATUSES) {
      const { headline, detail } = progressText(status, copy);
      const text = `${headline} ${detail}`;
      for (const promise of promises) {
        expect(text, `${status} must not promise rescue`).not.toMatch(promise);
      }
    }
  });

  it("does not let 'confirmed' read as 'somebody is coming'", () => {
    // The most dangerous of the five: a moderator judging a signal credible is
    // a statement about the signal, not a dispatch, and the word invites the
    // opposite reading. So the sentence has to disown it out loud.
    const confirmed = progressText("confirmed", copy);
    expect(confirmed.detail).toMatch(/hindi pa rin|still does not mean/i);
  });

  it("says a moderator read it, not that a moderator responded", () => {
    const opened = progressText("under_review", copy);
    expect(opened.headline).toMatch(/binuksan|opened/i);
    // And explicitly disowns the inference a reader would otherwise draw.
    expect(opened.detail).toMatch(/hindi ito nangangahulugang|does not mean/i);
  });

  it("points a dismissed sender at a number that does reach somebody", () => {
    // Being turned down here must not read as being out of options.
    expect(progressText("dismissed", copy).detail).toContain("barangay");
  });
});

describe("progressFor", () => {
  it("marks only the finished states as closed", () => {
    for (const status of ["pending", "under_review", "confirmed"] as const) {
      expect(progressFor(status).open).toBe(true);
    }
    for (const status of ["dismissed", "resolved"] as const) {
      expect(progressFor(status).open).toBe(false);
    }
  });

  it("names a real string for every status, in both languages", () => {
    // The keys are typed, so they cannot drift silently - but a key that exists
    // and resolves to an empty string would still render blank, on the one page
    // where blank is indistinguishable from "nothing has happened".
    for (const status of SOS_STATUSES) {
      const { headlineKey, detailKey } = progressFor(status);
      for (const copy of [tl, en]) {
        expect(copy[headlineKey], `${status} headline`).toBeTruthy();
        expect(copy[detailKey], `${status} detail`).toBeTruthy();
      }
    }
  });

  it("says something different in each language", () => {
    // Guards the failure this whole design exists to prevent: an English key
    // silently carrying the Tagalog sentence, which looks like a working page.
    for (const status of SOS_STATUSES) {
      const { headlineKey } = progressFor(status);
      expect(tl[headlineKey]).not.toBe(en[headlineKey]);
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
