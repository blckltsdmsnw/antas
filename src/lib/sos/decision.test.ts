import { describe, it, expect } from "vitest";
import {
  DISMISS_REASONS,
  SUSPENSION_THRESHOLD,
  countsTowardSuspension,
  shouldSuspend,
  isDismissReason,
  dismissReasonLabel,
} from "./decision";
import { copyFor } from "@/lib/i18n/strings";

describe("dismiss reasons", () => {
  it("lists every reason", () => {
    expect(DISMISS_REASONS).toEqual([
      "false_report",
      "duplicate",
      "resolved_already",
      "insufficient_info",
    ]);
  });

  it("counts only a fabricated report toward suspension", () => {
    expect(countsTowardSuspension("false_report")).toBe(true);
    expect(countsTowardSuspension("duplicate")).toBe(false);
    expect(countsTowardSuspension("resolved_already")).toBe(false);
    expect(countsTowardSuspension("insufficient_info")).toBe(false);
  });

  it("suspends at the third false report, not before", () => {
    expect(SUSPENSION_THRESHOLD).toBe(3);
    expect(shouldSuspend(2)).toBe(false);
    expect(shouldSuspend(3)).toBe(true);
    expect(shouldSuspend(4)).toBe(true);
  });

  it("recognises valid reason strings", () => {
    expect(isDismissReason("duplicate")).toBe(true);
    expect(isDismissReason("spam")).toBe(false);
  });

  it("gives every reason a label in both languages", () => {
    // An unlabelled option in this dropdown is a moderator dismissing somebody's
    // call for help without being able to read what they are choosing.
    for (const lang of ["tl", "en"] as const) {
      const copy = copyFor(lang).screens;
      for (const reason of DISMISS_REASONS) {
        expect(
          dismissReasonLabel(reason, copy).length,
          `${lang} ${reason}`,
        ).toBeGreaterThan(0);
      }
    }

    expect(dismissReasonLabel("duplicate", copyFor("tl").screens)).toBe(
      "Doble - naiulat na ito",
    );
    expect(dismissReasonLabel("duplicate", copyFor("en").screens)).toBe(
      "Duplicate - already reported",
    );
  });
});
