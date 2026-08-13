import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchCurrentWeather,
  isRaining,
  weatherLabel,
  RAINING_MM_PER_HOUR,
  UNKNOWN_WEATHER,
} from "./current-weather";

const realFetch = globalThis.fetch;

function respond(body: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

/** Hourly stamps in the shape the API returns them: no timezone suffix. */
function hourStamp(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3_600_000).toISOString().slice(0, 16);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("weatherLabel", () => {
  it("names the conditions that matter for a flood", () => {
    expect(weatherLabel(0)).toBe("Maaliwalas");
    expect(weatherLabel(3)).toBe("Maulap");
    expect(weatherLabel(61)).toBe("Umuulan");
    expect(weatherLabel(82)).toBe("Malakas na ulan");
    expect(weatherLabel(95)).toBe("May kulog at kidlat");
  });

  it("says nothing rather than guessing when the code is missing", () => {
    expect(weatherLabel(null)).toBeNull();
  });
});

describe("isRaining", () => {
  it("treats a trace as not raining", () => {
    // A hundredth of a millimetre would otherwise put rain on the map on a
    // clear day.
    expect(isRaining({ ...UNKNOWN_WEATHER, precipitationMm: 0.01 })).toBe(false);
  });

  it("counts real rain", () => {
    expect(
      isRaining({ ...UNKNOWN_WEATHER, precipitationMm: RAINING_MM_PER_HOUR }),
    ).toBe(true);
  });

  it("treats unknown as not raining", () => {
    // Absence of data must never animate rain onto the map.
    expect(isRaining(UNKNOWN_WEATHER)).toBe(false);
  });

  it("counts drizzle even when it measures below the threshold", () => {
    // The reported bug: the strip read "Ambon" while the map was drawn dry.
    // Drizzle is light by definition and often measures under 0.2mm, so the
    // observation code has to count too or the interface contradicts itself.
    expect(
      isRaining({ ...UNKNOWN_WEATHER, precipitationMm: 0, weatherCode: 55 }),
    ).toBe(true);
  });

  it("counts every kind of falling water", () => {
    for (const code of [51, 61, 65, 80, 82, 95]) {
      expect(isRaining({ ...UNKNOWN_WEATHER, weatherCode: code })).toBe(true);
    }
  });

  it("does not count clear or cloudy skies", () => {
    for (const code of [0, 1, 2, 3, 45]) {
      expect(isRaining({ ...UNKNOWN_WEATHER, weatherCode: code })).toBe(false);
    }
  });
});

describe("fetchCurrentWeather", () => {
  it("reads current conditions", async () => {
    respond({
      current: { precipitation: 1.4, weather_code: 61, temperature_2m: 28.3 },
      hourly: { time: [], precipitation: [] },
    });

    const weather = await fetchCurrentWeather(14.5, 121.05);
    expect(weather.precipitationMm).toBe(1.4);
    expect(weather.weatherCode).toBe(61);
    expect(weather.temperatureC).toBe(28.3);
  });

  it("totals only the last three hours of rain", async () => {
    respond({
      current: { precipitation: 0, weather_code: 3, temperature_2m: 30 },
      hourly: {
        time: [hourStamp(10), hourStamp(2), hourStamp(1)],
        precipitation: [50, 2, 3],
      },
    });

    // The 10-hour-old 50mm must not be counted; 2 + 3 = 5.
    expect((await fetchCurrentWeather(14.5, 121.05)).recentRainMm).toBe(5);
  });

  it("ignores stamps in the future", async () => {
    respond({
      current: { precipitation: 0, weather_code: 3, temperature_2m: 30 },
      hourly: { time: [hourStamp(-3), hourStamp(1)], precipitation: [99, 4] },
    });

    // The endpoint returns forecast hours too; counting them would report rain
    // that has not fallen yet.
    expect((await fetchCurrentWeather(14.5, 121.05)).recentRainMm).toBe(4);
  });

  it("returns unknown rather than throwing when the network fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as never;
    await expect(fetchCurrentWeather(14.5, 121.05)).resolves.toEqual(
      UNKNOWN_WEATHER,
    );
  });

  it("returns unknown on a non-OK response", async () => {
    respond({}, false);
    await expect(fetchCurrentWeather(14.5, 121.05)).resolves.toEqual(
      UNKNOWN_WEATHER,
    );
  });

  it("survives a payload with the fields missing", async () => {
    respond({ current: {}, hourly: {} });
    expect(await fetchCurrentWeather(14.5, 121.05)).toEqual(UNKNOWN_WEATHER);
  });
});
