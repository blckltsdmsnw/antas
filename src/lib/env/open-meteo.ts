import {
  UNAVAILABLE_READING,
  type EnvProvider,
  type EnvReading,
} from "./provider";

const DEFAULT_BASE = "https://api.open-meteo.com";
const TIMEOUT_MS = 8_000;

/** Roughly 1 km at Philippine latitudes. */
const RING_OFFSET_DEG = 0.009;

interface OpenMeteoProvider extends EnvProvider {
  withBaseUrl(baseUrl: string): OpenMeteoProvider;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // Deliberately swallowed: an unreachable provider must degrade to "we do
    // not know", never take down a distress submission.
    return null;
  }
}

/** Sums the precipitation samples falling inside the last 24 hours. */
function sumLast24h(times: string[], values: (number | null)[]): number | null {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const now = Date.now();
  let total = 0;
  let counted = 0;

  times.forEach((iso, i) => {
    const t = new Date(`${iso}Z`).getTime();
    if (Number.isNaN(t) || t < cutoff || t > now) return;
    const v = values[i];
    if (typeof v === "number") {
      total += v;
      counted += 1;
    }
  });

  return counted === 0 ? null : Number(total.toFixed(1));
}

function build(baseUrl: string): OpenMeteoProvider {
  return {
    withBaseUrl: (next: string) => build(next),

    async read(lat: number, lon: number): Promise<EnvReading> {
      // Centre first, then a four-point ring, in ONE request.
      const lats = [
        lat,
        lat + RING_OFFSET_DEG,
        lat - RING_OFFSET_DEG,
        lat,
        lat,
      ];
      const lons = [
        lon,
        lon,
        lon,
        lon + RING_OFFSET_DEG,
        lon - RING_OFFSET_DEG,
      ];

      const [elevationJson, forecastJson] = await Promise.all([
        getJson(
          `${baseUrl}/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`,
        ),
        getJson(
          `${baseUrl}/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&hourly=precipitation&past_days=1&forecast_days=1&timezone=UTC`,
        ),
      ]);

      if (elevationJson === null && forecastJson === null) {
        return UNAVAILABLE_READING;
      }

      let elevationM: number | null = null;
      let surroundingElevationM: number | null = null;

      const elevations = (elevationJson as { elevation?: unknown })?.elevation;
      if (Array.isArray(elevations) && elevations.length === lats.length) {
        const numbers = elevations.filter(
          (v): v is number => typeof v === "number",
        );
        if (numbers.length === lats.length) {
          elevationM = numbers[0];
          const ring = numbers.slice(1);
          surroundingElevationM =
            Math.round((ring.reduce((a, b) => a + b, 0) / ring.length) * 10) / 10;
        }
      }

      let rainfall24hMm: number | null = null;
      const hourly = (
        forecastJson as {
          hourly?: { time?: unknown; precipitation?: unknown };
        }
      )?.hourly;
      if (Array.isArray(hourly?.time) && Array.isArray(hourly?.precipitation)) {
        rainfall24hMm = sumLast24h(
          hourly.time as string[],
          hourly.precipitation as (number | null)[],
        );
      }

      return { rainfall24hMm, elevationM, surroundingElevationM };
    },
  };
}

export const openMeteoProvider = build(DEFAULT_BASE);
