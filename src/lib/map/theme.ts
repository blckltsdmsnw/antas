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
 * `prefersDark` is the resolved `prefers-color-scheme` media query, or null
 * where the user has expressed no preference.
 *
 * An explicit preference always wins. Someone who set their phone to dark mode
 * meant it, and a clock reading has no business overruling a stated choice.
 */
export function mapThemeFor(now: Date, prefersDark: boolean | null): MapTheme {
  if (prefersDark !== null) return prefersDark ? "dark" : "light";

  const minutes = manilaMinutes(now);
  return minutes >= DAY_START_HOUR * 60 && minutes <= DAY_END_HOUR * 60
    ? "light"
    : "dark";
}
