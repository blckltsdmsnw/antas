import { describe, it, expect } from "vitest";
import {
  REPORT_STATES,
  STATE_LABEL,
  STATE_SUMMARY,
  isReportState,
  leadingUpdate,
  totalVotes,
  type UpdateTally,
} from "./update";

const NOW = new Date("2026-08-14T15:40:00+08:00");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function tally(
  state: UpdateTally["state"],
  votes: number,
  minutes: number,
): UpdateTally {
  return { state, votes, latest: minutesAgo(minutes) };
}

describe("leadingUpdate", () => {
  it("says nothing when nobody has answered", () => {
    // Not "wala na". An unanswered report is not an all-clear, and the caller
    // has to be able to tell the difference.
    expect(leadingUpdate([])).toBeNull();
  });

  it("leads with the most recent answer, not the most numerous", () => {
    // The whole rule, in one case. Ten people an hour ago describe an earlier
    // moment; one person two minutes ago describes now. Water moves.
    const leading = leadingUpdate([
      tally("same", 10, 60),
      tally("deeper", 1, 2),
    ]);

    expect(leading?.state).toBe("deeper");
  });

  it("still leads with the recent answer when it is the reassuring one", () => {
    // The mirror of the case above, so the rule cannot quietly degrade into
    // "always show the worst state".
    const leading = leadingUpdate([tally("deeper", 8, 90), tally("gone", 1, 3)]);

    expect(leading?.state).toBe("gone");
  });

  it("breaks a tie toward the worse state", () => {
    // Same instant, opposite claims. Overstating the water sends someone the
    // long way round; understating it sends them into it.
    const sameMoment = minutesAgo(5);

    expect(
      leadingUpdate([
        { state: "gone", votes: 4, latest: sameMoment },
        { state: "deeper", votes: 1, latest: sameMoment },
      ])?.state,
    ).toBe("deeper");

    // The order the rows arrive in must not decide it.
    expect(
      leadingUpdate([
        { state: "deeper", votes: 1, latest: sameMoment },
        { state: "gone", votes: 4, latest: sameMoment },
      ])?.state,
    ).toBe("deeper");
  });

  it("does not reorder the caller's array", () => {
    // The component renders this same list as well as passing it here.
    const tallies = [tally("same", 1, 60), tally("deeper", 1, 2)];
    leadingUpdate(tallies);

    expect(tallies[0].state).toBe("same");
  });
});

describe("totalVotes", () => {
  it("adds every state's count, not just the leading one", () => {
    expect(totalVotes([tally("gone", 2, 5), tally("same", 3, 40)])).toBe(5);
  });

  it("is zero with no answers", () => {
    expect(totalVotes([])).toBe(0);
  });
});

describe("isReportState", () => {
  it("accepts the three the database enum allows", () => {
    for (const state of REPORT_STATES) {
      expect(isReportState(state)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    // The server action guards on this before touching the database, so a
    // false positive here becomes a failed insert with a 500 attached.
    expect(isReportState("shallower")).toBe(false);
    expect(isReportState("")).toBe(false);
    expect(isReportState("GONE")).toBe(false);
  });
});

describe("labels", () => {
  it("covers every state in both voices", () => {
    // A missing key renders as blank rather than throwing, so a gap here stays
    // invisible until someone is looking at an unlabelled button.
    for (const state of REPORT_STATES) {
      expect(STATE_LABEL[state]).toBeTruthy();
      expect(STATE_SUMMARY[state]).toBeTruthy();
    }
  });
});
