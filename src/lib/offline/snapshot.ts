import type { MapReport } from "@/components/FloodMap";
import { cacheAge, mayShowCached, type CacheAge } from "./staleness";

/**
 * The last set of reports that arrived live, kept so the map has something to
 * draw when there is no signal.
 *
 * Held by the page rather than by the service worker, and not by choice: the
 * map's data comes from `reports_near`, which is a Supabase RPC and therefore a
 * POST, and the Cache API refuses to store a non-GET request. A worker cannot
 * cache this however it is written.
 *
 * It turns out to be the better place regardless. The rule that matters -
 * whether a flood reading is still true - is a question about the data, not
 * about the transport, and here it sits beside the code deciding whether to
 * draw a pin.
 */

// v2: a snapshot saved before hazards existed has no `hazard` or `severity`,
// and restoring it would hand `HazardIcon` an undefined hazard. The file's own
// rule is that anything unreadable is too old, so a new key discards the old
// shape cleanly instead of trying to patch it up.
const KEY = "antas:last-reports:v2";

interface Snapshot {
  savedAt: string;
  reports: MapReport[];
}

export interface RestoredSnapshot {
  reports: MapReport[];
  age: CacheAge;
}

/**
 * Keep the reports that just arrived, stamped with the moment they did.
 *
 * Failure is silent: a full or blocked localStorage costs the user an offline
 * map, which is a smaller loss than an error on the page they opened during a
 * flood - and nothing they could act on either way.
 */
export function saveSnapshot(reports: MapReport[], now: Date = new Date()): void {
  try {
    const snapshot: Snapshot = { savedAt: now.toISOString(), reports };
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // See above.
  }
}

/**
 * The last snapshot, if it is recent enough to be worth drawing.
 *
 * Returns the age either way, because the caller has something to say in both
 * cases: over recent data, how old it is; over refused data, why the map is
 * empty.
 *
 * ANYTHING UNREADABLE IS TREATED AS TOO OLD. A snapshot whose shape has changed,
 * or whose timestamp will not parse, cannot be vouched for - and a flood reading
 * of unknown age drawn as current is precisely what this path exists to prevent.
 */
export function restoreSnapshot(now: Date = new Date()): RestoredSnapshot | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }

  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reports: [], age: cacheAge(null, now) };
  }

  const snapshot = parsed as Partial<Snapshot>;
  if (!Array.isArray(snapshot.reports)) {
    return { reports: [], age: cacheAge(null, now) };
  }

  const age = cacheAge(
    typeof snapshot.savedAt === "string" ? snapshot.savedAt : null,
    now,
  );

  return {
    reports: mayShowCached(age) ? snapshot.reports : [],
    age,
  };
}
