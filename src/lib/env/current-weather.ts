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
export function weatherLabel(code: number | null): string | null {
  if (code === null) return null;
  if (code === 0) return "Maaliwalas";
  if (code <= 3) return "Maulap";
  if (code <= 48) return "Mahamog";
  if (code <= 57) return "Ambon";
  if (code <= 82) return code >= 80 ? "Malakas na ulan" : "Umuulan";
  if (code <= 86) return "Umuulan";
  return "May kulog at kidlat";
}

/** The point at which rain is worth showing on the map itself. */
export const RAINING_MM_PER_HOUR = 0.2;

export function isRaining(weather: CurrentWeather): boolean {
  return (weather.precipitationMm ?? 0) >= RAINING_MM_PER_HOUR;
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
