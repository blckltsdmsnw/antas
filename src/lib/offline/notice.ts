import type { Copy } from "@/lib/i18n/strings";
import type { CacheAge } from "./staleness";

/**
 * The line shown over cached flood data.
 *
 * ALWAYS STATES THE AGE, never merely "offline". Telling somebody the network
 * is down does not tell them the pin under their thumb is two hours old, and
 * that second fact is the one deciding whether they walk down a street.
 *
 * Split out from `staleness.ts` when the product gained a second language.
 * `staleness.ts` decides - fresh, ageing, too old, undated - and this turns the
 * decision into a sentence. Keeping the words there would have meant either a
 * Tagalog-only safety notice or a pure function that had to be handed a
 * dictionary to stay pure.
 */
export function offlineNotice(age: CacheAge, copy: Copy["map"]): string {
  // Two different refusals. "Too old to show" and "we cannot tell how old this
  // is" are both reasons to draw nothing, and the reader is owed the right one.
  if (!age.dated) return copy.cachedUndated;
  if (age.verdict === "too-old") return copy.cachedTooOld;

  if (age.minutes < 1) return copy.cachedJustNow;
  if (age.minutes < 60) return copy.cachedMinutes(age.minutes);

  return copy.cachedHours(Math.floor(age.minutes / 60));
}
