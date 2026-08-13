/**
 * How much a report should still be believed.
 *
 * The map previously drew a report from five minutes ago and one from three
 * days ago as identical dots, which quietly claims a currency the data does not
 * have. Floodwater recedes in hours; a day-old pin describes a street that has
 * almost certainly changed.
 *
 * This is a *secondary* cue only. Opacity must never be the sole carrier of the
 * information - the detail card and the street history both state the age in
 * words, which is what someone who cannot perceive the fade relies on.
 */

export type Freshness = "live" | "recent" | "old" | "stale";

/** Upper bound of each tier, in hours since the report was made. */
export const FRESHNESS_HOURS = Object.freeze({
  live: 1,
  recent: 6,
  old: 24,
} as const);

const HOUR_MS = 3_600_000;

export function freshnessOf(iso: string, now: Date = new Date()): Freshness {
  const hours = (now.getTime() - new Date(iso).getTime()) / HOUR_MS;

  // A phone clock running ahead of the server is ordinary, and a negative age
  // is not evidence of anything except clock skew - so it falls through here
  // as "live" rather than being treated as an error.
  if (hours < FRESHNESS_HOURS.live) return "live";
  if (hours < FRESHNESS_HOURS.recent) return "recent";
  if (hours < FRESHNESS_HOURS.old) return "old";
  return "stale";
}

/**
 * Deliberately bottoms out well above zero. A stale report is still a report -
 * it has to stay visible and tappable, just visibly older.
 */
const OPACITY: Readonly<Record<Freshness, number>> = Object.freeze({
  live: 1,
  recent: 0.78,
  old: 0.58,
  stale: 0.42,
});

export function freshnessOpacity(freshness: Freshness): number {
  return OPACITY[freshness];
}
