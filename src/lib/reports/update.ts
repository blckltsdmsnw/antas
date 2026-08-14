/**
 * "Kumusta na?" - whether a report is still true.
 *
 * A pin ages, and the question people arrive with is not who filed it but
 * whether the water is still there. This is the structured answer to that.
 *
 * NOT COMMENTS, deliberately. Free text under a report on an unmoderated safety
 * tool is a way for "wala na po" to appear beneath water that is still
 * chest-deep. Three states carry the same information, need no moderation
 * because there is no prose to moderate, and can be counted - which a thread
 * cannot.
 *
 * Three, not five: this says something about the reading that already exists,
 * not a new one. Recording an actual new depth means filing a report.
 */

export const REPORT_STATES = ["gone", "same", "deeper"] as const;

export type ReportState = (typeof REPORT_STATES)[number];

export function isReportState(value: string): value is ReportState {
  return (REPORT_STATES as readonly string[]).includes(value);
}

/** What the person tapping the button is saying, in their own words. */
export const STATE_LABEL: Readonly<Record<ReportState, string>> = Object.freeze({
  gone: "Wala na",
  same: "Ganoon pa rin",
  deeper: "Mas mataas na",
});

/** The same three, phrased as a report of what other people have said. */
export const STATE_SUMMARY: Readonly<Record<ReportState, string>> = Object.freeze({
  gone: "Wala na raw ang tubig",
  same: "Ganoon pa rin daw",
  deeper: "Mas mataas na raw",
});

export interface UpdateTally {
  state: ReportState;
  votes: number;
  latest: string;
}

/**
 * What to lead with when people disagree.
 *
 * The most RECENT word wins, not the most numerous. Ten people saying "ganoon
 * pa rin" an hour ago do not outrank one person saying "mas mataas na" two
 * minutes ago - water moves, and the older consensus is only describing an
 * earlier moment. Ties break toward the worse state, because being wrong in the
 * direction of caution is the survivable mistake.
 */
const SEVERITY: Readonly<Record<ReportState, number>> = Object.freeze({
  gone: 0,
  same: 1,
  deeper: 2,
});

export function leadingUpdate(tallies: readonly UpdateTally[]): UpdateTally | null {
  if (tallies.length === 0) return null;

  return [...tallies].sort((a, b) => {
    const byTime = new Date(b.latest).getTime() - new Date(a.latest).getTime();
    return byTime !== 0 ? byTime : SEVERITY[b.state] - SEVERITY[a.state];
  })[0];
}

export function totalVotes(tallies: readonly UpdateTally[]): number {
  return tallies.reduce((sum, tally) => sum + tally.votes, 0);
}
