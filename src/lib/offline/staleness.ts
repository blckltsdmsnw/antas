/**
 * Whether cached flood data may still be shown, and how it must be labelled.
 *
 * This is the safety decision in the offline work, so it is a pure function
 * with its own tests rather than a condition buried in a component.
 *
 * The danger is specific. A cached map that opens instantly with no signal is
 * genuinely useful - no signal is the condition this application is most likely
 * to be opened in. But a pin from six hours ago, drawn exactly like a live one,
 * says "the water here is knee-deep" about a street that may now be impassable,
 * or dry. Rendering old data as current is the same class of harm as telling
 * somebody a rescuer is on the way.
 *
 * So: show it, say how old it is, and past a point refuse to show it at all.
 */

/**
 * Past this, cached depth reports are not shown.
 *
 * Six hours, agreed with the owner. Floodwater moves in far less than that, so
 * anything older describes a street that has almost certainly changed - and the
 * honest answer becomes "we cannot reach the server and what we have is too old
 * to trust", which is a sentence somebody can act on. A stale map they believe
 * is not.
 */
export const MAX_CACHE_AGE_HOURS = 6;

/** Below this, the cache is recent enough not to need a loud warning. */
const FRESH_MINUTES = 20;

export type CacheVerdict = "fresh" | "ageing" | "too-old";

export interface CacheAge {
  verdict: CacheVerdict;
  minutes: number;
  /**
   * Whether the age is actually known.
   *
   * "Too old to show" and "we cannot tell how old this is" are both refusals,
   * but they are different sentences and the reader deserves the right one.
   * The words live in `copy.map.cached*`: this module decides, it does not
   * speak, which is what lets the decision stay one tested pure function while
   * the product carries two languages.
   */
  dated: boolean;
}

const UNDATED: CacheAge = Object.freeze({
  verdict: "too-old",
  minutes: Number.MAX_SAFE_INTEGER,
  dated: false,
});

function minutesBetween(cachedAt: string, now: Date): number | null {
  const at = new Date(cachedAt).getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now.getTime() - at) / 60_000));
}

/**
 * How old the cached data is, and what the reader must be told about it.
 *
 * A missing or unparseable timestamp is treated as TOO OLD, never as fresh. The
 * cache cannot vouch for data it cannot date, and defaulting the other way
 * would put flood readings of unknown age on screen as though they were
 * current.
 */
export function cacheAge(
  cachedAt: string | null,
  now: Date = new Date(),
): CacheAge {
  if (cachedAt === null) return UNDATED;

  const minutes = minutesBetween(cachedAt, now);
  if (minutes === null) return UNDATED;

  if (minutes >= MAX_CACHE_AGE_HOURS * 60) {
    return { verdict: "too-old", minutes, dated: true };
  }

  return {
    verdict: minutes < FRESH_MINUTES ? "fresh" : "ageing",
    minutes,
    dated: true,
  };
}

/** Whether cached reports may be drawn on the map at all. */
export function mayShowCached(age: CacheAge): boolean {
  return age.verdict !== "too-old";
}
