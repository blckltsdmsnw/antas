import type { Copy } from "@/lib/i18n/strings";

/**
 * Why a moderator took a depth report off the map.
 *
 * Deliberately not `lib/sos/decision.ts`'s list. The two decisions look alike
 * and are not: dismissing an SOS is a judgement about a request for help, and
 * three fabricated ones suspend the account. Hiding a depth report is a
 * judgement about a *measurement* - most often that it is simply old - and it
 * touches reputation not at all. `stale` is the reason that makes the
 * difference obvious: there is no such thing as a stale rescue request.
 *
 * Must match the `report_decision_reason` enum in 0027.
 */
export const HIDE_REASONS = [
  "not_true",
  "duplicate",
  "stale",
  "wrong_place",
] as const;

export type HideReason = (typeof HIDE_REASONS)[number];

const LABEL_KEY: Record<HideReason, keyof Copy["screens"]> = {
  not_true: "hideNotTrue",
  duplicate: "hideDuplicate",
  stale: "hideStale",
  wrong_place: "hideWrongPlace",
};

export function isHideReason(value: string): value is HideReason {
  return (HIDE_REASONS as readonly string[]).includes(value);
}

export function hideReasonLabel(
  reason: HideReason,
  copy: Copy["screens"],
): string {
  return copy[LABEL_KEY[reason]] as string;
}

/**
 * The three priority bands `report_priority()` returns, in the order a queue
 * puts them.
 *
 * Mirrored here so the console can label and colour a band without holding a
 * second opinion about what the bands are. The rule that *assigns* them stays
 * in SQL, where it is applied while ordering the queue; a copy of it in
 * TypeScript would be a second source of truth that drifts the first time
 * either one moves.
 */
export const PRIORITIES = ["urgent", "watch", "routine"] as const;

export type Priority = (typeof PRIORITIES)[number];

const PRIORITY_KEY: Record<Priority, keyof Copy["screens"]> = {
  urgent: "priorityUrgent",
  watch: "priorityWatch",
  routine: "priorityRoutine",
};

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

/**
 * Falls back to the routine label rather than throwing.
 *
 * A band this build does not recognise means the database is ahead of the
 * deployment - a deploy-ordering problem, not a reason to blank a moderator's
 * queue. The row sorts where the server put it either way; only the word is a
 * guess, and `routine` is the guess that does not overstate.
 */
export function priorityLabel(value: string, copy: Copy["screens"]): string {
  const key = PRIORITY_KEY[isPriority(value) ? value : "routine"];
  return copy[key] as string;
}
