/**
 * Timestamps for a flood map.
 *
 * Two different questions hide inside "when": *how stale is this* and *what
 * time was the water actually like that*. A relative count answers the first
 * and is what someone scanning a list needs; a wall clock answers the second
 * and is what someone deciding whether a photo still describes the street
 * needs. Both get shown, because neither alone is enough.
 */

/**
 * Philippine Standard Time, pinned rather than inherited.
 *
 * The device timezone is the wrong source: a phone left on another region's
 * setting - or a timestamp formatted during server rendering - would report an
 * hour the flood never happened at. There is exactly one timezone this app's
 * water is in.
 */
const MANILA = "Asia/Manila";

/** Filipino month abbreviations; Intl has no `fil` short-month we can rely on. */
const MONTHS_TL = Object.freeze([
  "Ene", "Peb", "Mar", "Abr", "May", "Hun",
  "Hul", "Ago", "Set", "Okt", "Nob", "Dis",
] as const);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Past this, a day count is harder to place than the date itself. */
const DATE_AFTER_DAYS = 7;

/** Extracts calendar parts as they read in Manila, whatever the host timezone. */
function manilaParts(date: Date): { day: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA,
    day: "numeric",
    month: "numeric",
  }).formatToParts(date);

  const value = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return { day: value("day"), month: value("month") };
}

/**
 * How long ago, in the coarsest unit that still says something useful.
 *
 * `now` is injectable so this is testable without freezing the clock.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();

  // A phone's clock running ahead of the server is ordinary. Reporting it as
  // "-3 minuto" would look like a bug in the data rather than in the clock.
  if (elapsed < MINUTE_MS) return "ngayon lang";

  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)} minuto`;
  }

  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)} oras`;
  }

  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return "kahapon";
  if (days < DATE_AFTER_DAYS) return `${days} araw`;

  const { day, month } = manilaParts(new Date(iso));
  return `${MONTHS_TL[month - 1]} ${day}`;
}

/** The wall clock reading, in the only timezone this app's water is in. */
export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    // Some ICU builds render "3:40 pm" for en-PH; the map uses caps throughout.
    .replace(/\s*([ap])\.?m\.?$/i, (_, meridiem: string) => ` ${meridiem.toUpperCase()}M`);
}

/**
 * Both readings, for anywhere with room for one line.
 *
 * Something taken seconds ago gets the relative form only - "ngayon lang ·
 * 3:40 PM" spends half a line telling you the current time.
 */
export function timestampLabel(iso: string, now: Date = new Date()): string {
  const relative = relativeTime(iso, now);
  if (relative === "ngayon lang") return relative;
  return `${relative} · ${clockTime(iso)}`;
}
