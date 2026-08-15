"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchCurrentWeather,
  weatherKind,
  weatherLabel,
  type CurrentWeather,
} from "@/lib/env/current-weather";
import { WeatherIcon } from "@/components/WeatherIcon";
import { useCopy } from "@/lib/i18n/context";

interface WeatherStripProps {
  /** Reported upward so the map can react to real rain. */
  onWeather?: (weather: CurrentWeather) => void;
}

type Stage = "idle" | "locating" | "loaded" | "unavailable";

/**
 * Live conditions where the user actually is.
 *
 * Deliberately does not ask for location on mount. A permission prompt fired by
 * merely opening the map is the same mistake the camera used to make, and this
 * is a nicety - the map has to work perfectly without it.
 *
 * Where permission was already granted the browser will not prompt again, so in
 * that case only, the reading is fetched silently.
 */
export function WeatherStrip({ onWeather }: WeatherStripProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const copy = useCopy();
  const [weather, setWeather] = useState<CurrentWeather | null>(null);

  const load = useCallback(async () => {
    setStage("locating");

    const position = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        timeout: 10_000,
        maximumAge: 600_000,
      }),
    );

    if (!position) {
      setStage("unavailable");
      return;
    }

    const reading = await fetchCurrentWeather(
      position.coords.latitude,
      position.coords.longitude,
    );

    // All-null means the provider told us nothing; an empty strip is worse
    // than no strip.
    if (reading.weatherCode === null && reading.recentRainMm === null) {
      setStage("unavailable");
      return;
    }

    setWeather(reading);
    setStage("loaded");
    onWeather?.(reading);
  }, [onWeather]);

  // Auto-load only where the answer is already yes - this must never be the
  // thing that raises a permission prompt.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === "granted") void load();
      })
      .catch(() => {
        // Safari has historically lacked geolocation in the Permissions API.
        // Staying idle just means the user taps once.
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (stage === "unavailable") return null;

  if (stage === "idle") {
    return (
      <button
        type="button"
        className="weather-strip weather-strip--ask"
        onClick={() => void load()}
      >
        {copy.map.weatherAsk}
      </button>
    );
  }

  if (stage === "locating" || !weather) {
    return (
      <p className="weather-strip weather-strip--muted">
        {copy.map.weatherLoading}
      </p>
    );
  }

  const kind = weatherKind(weather.weatherCode);
  const label = weatherLabel(weather.weatherCode, copy.map);
  const rain = weather.recentRainMm;

  return (
    <p className="weather-strip" aria-live="polite">
      {/* Both derived from the same grouping, so the picture and the word can
          never describe different weather. */}
      {kind && <WeatherIcon kind={kind} />}
      {label && <span className="weather-now">{label}</span>}
      {typeof weather.temperatureC === "number" && (
        <span className="weather-temp">{Math.round(weather.temperatureC)}°</span>
      )}
      {/* The three-hour total is the number that predicts a flooded street; the
          current hour alone reads as calm the moment the rain pauses. */}
      {/* "25.2 mm / 3h" read as unit jargon; "sa 3 oras" says the period in a
          word. "ulan" is dropped - the badge is on a weather strip, so what is
          being measured is not in doubt, and the longer wording pushed the
          condition label into an ellipsis. The decimal goes too: tenths of a
          millimetre change nothing about whether to walk down a street. */}
      {typeof rain === "number" && rain > 0 && (
        <span className="weather-rain">{copy.map.weatherRain(Math.round(rain))}</span>
      )}
    </p>
  );
}
