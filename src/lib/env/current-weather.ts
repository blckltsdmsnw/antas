/**
 * Current conditions for the map header.
 *
 * Deliberately separate from `open-meteo.ts`, which answers a different
 * question for a different caller: that one runs server-side during SOS
 * scoring, fetches a five-point elevation ring, and sums 24 hours of rain to
 * judge whether a distress signal is plausible. This runs in the browser, wants
 * only "is it raining on me right now", and has to give up quickly - nobody
 * waits eight seconds for a weather strip.
 */

import type { Copy } from "@/lib/i18n/strings";

const BASE = "https://api.open-meteo.com";

/** Short, because this is context next to the map, not the map itself. */
const TIMEOUT_MS = 4_000;

export interface CurrentWeather {
  /** Rain in the current hour, millimetres. */
  precipitationMm: number | null;
  /** Total over the last 3 hours - what tells you a street is filling. */
  recentRainMm: number | null;
  temperatureC: number | null;
  /** WMO code, translated by `weatherLabel`. */
  weatherCode: number | null;
}

export const UNKNOWN_WEATHER: CurrentWeather = Object.freeze({
  precipitationMm: null,
  recentRainMm: null,
  temperatureC: null,
  weatherCode: null,
});

/**
 * WMO weather codes, grouped rather than enumerated.
 *
 * The full table has 28 entries distinguishing "slight" from "moderate"
 * drizzle. Nobody deciding whether to walk home needs that, and every extra
 * string is another one to translate and keep consistent.
 */
export type WeatherKind =
  | "clear"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "downpour"
  | "storm";

/**
 * The grouping itself, separated from the words.
 *
 * The strip shows a word and an icon, and they must never describe different
 * weather. Two copies of these thresholds is exactly how that happens - one
 * gets a boundary nudged and the other does not - so both derive from here.
 */
export function weatherKind(code: number | null): WeatherKind | null {
  if (code === null) return null;
  if (code === 0) return "clear";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 82) return code >= 80 ? "downpour" : "rain";
  if (code <= 86) return "rain";
  return "storm";
}

/**
 * Which string names each grouping.
 *
 * Keys rather than words, because the product carries two languages and this
 * module has no business holding either. `Record<WeatherKind, ...>` is doing
 * real work here: adding a kind without naming it stops compiling, which is a
 * stronger guarantee than the test that used to check the same thing by
 * enumerating WMO codes.
 */
export const CONDITION_KEY: Readonly<Record<WeatherKind, keyof Copy["map"]>> =
  Object.freeze({
    clear: "weatherClear",
    cloudy: "weatherCloudy",
    fog: "weatherFog",
    drizzle: "weatherDrizzle",
    rain: "weatherRaining",
    downpour: "weatherDownpour",
    storm: "weatherStorm",
  });

/** The condition in words, or null when the provider told us nothing. */
export function weatherLabel(
  code: number | null,
  copy: Copy["map"],
): string | null {
  const kind = weatherKind(code);
  return kind === null ? null : (copy[CONDITION_KEY[kind]] as string);
}

/** The point at which measured rain is worth showing on the map itself. */
export const RAINING_MM_PER_HOUR = 0.2;

/**
 * First WMO code that means water is falling: 51-57 drizzle, 61-67 rain,
 * 80-86 showers, 95+ thunderstorm.
 */
const FIRST_PRECIPITATION_CODE = 51;

/**
 * Whether to draw rain on the map.
 *
 * Two signals, either of which is enough. Drizzle can measure below the
 * millimetre threshold while the observation plainly says "Ambon" - and a
 * strip reading "Ambon" above a map drawn as if it were dry is the interface
 * contradicting itself. Whichever source notices the rain, the map shows it.
 *
 * Unknown weather is still not rain: `null` fails both tests, so an
 * unreachable provider never animates.
 */
export function isRaining(weather: CurrentWeather): boolean {
  if ((weather.precipitationMm ?? 0) >= RAINING_MM_PER_HOUR) return true;
  return (
    weather.weatherCode !== null &&
    weather.weatherCode >= FIRST_PRECIPITATION_CODE
  );
}

function sumLastHours(
  times: string[],
  values: (number | null)[],
  hours: number,
): number | null {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  let total = 0;
  let counted = 0;

  times.forEach((iso, index) => {
    // Open-Meteo returns bare local-to-requested-zone stamps like
    // "2026-08-14T07:00"; we ask for UTC, so pin the zone before parsing.
    const at = new Date(`${iso}Z`).getTime();
    if (Number.isNaN(at) || at < cutoff || at > now) return;
    const value = values[index];
    if (typeof value === "number") {
      total += value;
      counted += 1;
    }
  });

  return counted === 0 ? null : Number(total.toFixed(1));
}

/**
 * Never throws and never rejects. A missing weather strip is a non-event; an
 * unhandled rejection on the map page is not.
 */
export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  baseUrl: string = BASE,
): Promise<CurrentWeather> {
  let json: unknown;
  try {
    const response = await fetch(
      `${baseUrl}/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=precipitation,weather_code,temperature_2m` +
        `&hourly=precipitation&past_days=1&forecast_days=1&timezone=UTC`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!response.ok) return UNKNOWN_WEATHER;
    json = await response.json();
  } catch {
    // Same discipline as the scoring provider: unreachable means "we do not
    // know", never a thrown error on a page someone opened during a flood.
    return UNKNOWN_WEATHER;
  }

  const current = (
    json as {
      current?: {
        precipitation?: unknown;
        weather_code?: unknown;
        temperature_2m?: unknown;
      };
    }
  )?.current;

  const hourly = (json as { hourly?: { time?: unknown; precipitation?: unknown } })
    ?.hourly;

  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    precipitationMm: num(current?.precipitation),
    temperatureC: num(current?.temperature_2m),
    weatherCode: num(current?.weather_code),
    recentRainMm:
      Array.isArray(hourly?.time) && Array.isArray(hourly?.precipitation)
        ? sumLastHours(
            hourly.time as string[],
            hourly.precipitation as (number | null)[],
            3,
          )
        : null,
  };
}
