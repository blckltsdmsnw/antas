import { describe, it, expect } from "vitest";
import { copyFor } from "@/lib/i18n/strings";
import {
  HIDE_REASONS,
  PRIORITIES,
  hideReasonLabel,
  isHideReason,
  isPriority,
  priorityLabel,
} from "./decision";

const tl = copyFor("tl").screens;
const en = copyFor("en").screens;

describe("hide reasons", () => {
  it("matches the report_decision_reason enum in 0027", () => {
    // If this list and the migration's enum drift, `decide_report` rejects
    // whatever the console sends and a moderator can never hide anything. The
    // failure surfaces at the database, far from the select box that caused
    // it, so it is pinned here where the two are written down together.
    expect([...HIDE_REASONS]).toEqual([
      "not_true",
      "duplicate",
      "stale",
      "wrong_place",
    ]);
  });

  it("rejects a reason it does not know", () => {
    expect(isHideReason("resolved_already")).toBe(false);
    expect(isHideReason("")).toBe(false);
  });

  it("accepts every reason it offers", () => {
    for (const reason of HIDE_REASONS) {
      expect(isHideReason(reason)).toBe(true);
    }
  });

  it("has a label in both languages for every reason", () => {
    for (const reason of HIDE_REASONS) {
      expect(hideReasonLabel(reason, tl)).toBeTruthy();
      expect(hideReasonLabel(reason, en)).toBeTruthy();
    }
  });

  it("does not reuse the SOS wording for staleness", () => {
    // The two vocabularies look alike and mean different things: hiding a
    // depth report as stale is not an accusation, and dismissing an SOS as
    // false always is. Wording that blurred them would put a moderator one
    // wrong click from recording somebody as a false reporter.
    expect(hideReasonLabel("stale", en)).not.toBe(en.dismissFalse);
    expect(hideReasonLabel("stale", tl)).not.toBe(tl.dismissFalse);
  });
});

describe("priority bands", () => {
  it("labels every band the queue can return, in both languages", () => {
    for (const band of PRIORITIES) {
      expect(priorityLabel(band, tl)).toBeTruthy();
      expect(priorityLabel(band, en)).toBeTruthy();
    }
  });

  it("falls back to routine for a band this build does not know", () => {
    // A database ahead of the deployment is a deploy-ordering problem, not a
    // reason to blank a moderator's queue - and `routine` is the guess that
    // does not overstate what is known about the row.
    expect(isPriority("catastrophic")).toBe(false);
    expect(priorityLabel("catastrophic", en)).toBe(en.priorityRoutine);
  });

  it("keeps the three bands distinct in both languages", () => {
    const tagalog = new Set(PRIORITIES.map((band) => priorityLabel(band, tl)));
    const english = new Set(PRIORITIES.map((band) => priorityLabel(band, en)));
    expect(tagalog.size).toBe(PRIORITIES.length);
    expect(english.size).toBe(PRIORITIES.length);
  });
});
