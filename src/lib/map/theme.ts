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
 * The clock decides, and nothing else does.
 *
 * `prefers-color-scheme` used to override this, on the reasoning that someone
 * who set their phone to dark mode meant it. That reasoning does not survive
 * contact with how people actually use dark mode: most who turn it on leave it
 * on permanently, so the setting says nothing about the light they are standing
 * in right now. The result was a dark basemap at 1:41pm - the precise condition
 * every other surface in this product stays light for, because dark UI is
 * harder to read outdoors in daylight, which is when floods happen.
 *
 * The two failures were mirror images. First the map stayed bright at 4am,
 * because a device reporting "light" was misread as a deliberate choice. Then,
 * once only dark counted, the map went dark at lunchtime. Both came from
 * treating a colour-scheme setting as evidence about ambient light. It is not,
 * so it is no longer consulted: the sun is the only thing this tracks.
 */
export function mapThemeFor(now: Date): MapTheme {
  const minutes = manilaMinutes(now);
  return minutes >= DAY_START_HOUR * 60 && minutes <= DAY_END_HOUR * 60
    ? "light"
    : "dark";
}
