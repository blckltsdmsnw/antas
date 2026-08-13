/**
 * Whether the map should draw light or dark.
 *
 * The design doc rejects a dark interface, and the reasoning is sound for the
 * page chrome: dark UI is worse outdoors in daylight, which is when floods
 * happen. That argument inverts after sunset. A white map at 2am is glare in a
 * dark street, and typhoon flooding does not stop at 6pm - so the *basemap*
 * follows the clock even though the task pages stay light.
 */

export type MapTheme = "light" | "dark";

/** Manila, pinned - same reasoning as `src/lib/time/relative.ts`. */
const MANILA = "Asia/Manila";

/** Light from 06:00, dark from 18:01. */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 18;

/**
 * Minutes since Manila midnight.
 *
 * Minutes rather than whole hours because the boundary is 18:00 exactly: at
 * hour precision, 18:01 still reads as hour 18 and the map stays light for
 * another fifty-nine minutes after it should have turned.
 */
function manilaMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // An h24 hour cycle renders midnight as 24; normalise it back to 0.
  return (value("hour") % 24) * 60 + value("minute");
}

/**
 * `prefersDark` is the user's stated colour-scheme preference, or null where
 * they have not stated one.
 *
 * A stated preference wins. Someone who set their phone to dark mode meant it,
 * and a clock reading has no business overruling a deliberate choice.
 */
export function mapThemeFor(now: Date, prefersDark: boolean | null): MapTheme {
  if (prefersDark !== null) return prefersDark ? "dark" : "light";

  const minutes = manilaMinutes(now);
  return minutes >= DAY_START_HOUR * 60 && minutes <= DAY_END_HOUR * 60
    ? "light"
    : "dark";
}

/**
 * What the browser says the user prefers - `true` for dark, `null` for "no
 * stated choice". It never returns `false`, and that asymmetry is the point.
 *
 * `prefers-color-scheme: no-preference` was removed from the specification and
 * matches nothing: a browser reports `light` both for someone who chose light
 * and for someone who chose nothing at all. Treating that `light` as a stated
 * preference meant the clock was never consulted, and the map stayed bright at
 * four in the morning.
 *
 * So only a dark preference overrides. Light is indistinguishable from the
 * default, and the default should defer to the time of day.
 */
export function preferredScheme(
  matchMedia?: (query: string) => { matches: boolean },
): boolean | null {
  // Checking for the function, not just for `window`: an old webview can have
  // a window and no matchMedia at all, and calling .bind on undefined there
  // throws inside the component and takes the whole map down with it.
  const match =
    matchMedia ??
    (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia.bind(window)
      : undefined);

  if (!match) return null;
  return match("(prefers-color-scheme: dark)").matches ? true : null;
}
