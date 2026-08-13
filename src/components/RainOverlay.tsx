"use client";

import { isRaining, type CurrentWeather } from "@/lib/env/current-weather";

interface RainOverlayProps {
  weather: CurrentWeather | null;
}

/** Rain at or above this reads as heavy; scales the effect, does not gate it. */
const HEAVY_MM_PER_HOUR = 8;

/**
 * Rain on the map, when it is actually raining on the user.
 *
 * Driven by measured precipitation rather than decoration: `isRaining` returns
 * false for unknown weather and for a trace, so this cannot animate on a clear
 * day or when the provider is unreachable.
 *
 * Two constraints shaped it. The target user is on a cheap phone in a storm, so
 * it is two GPU-composited gradient layers and nothing else - no canvas, no
 * per-drop DOM nodes. And it stops completely under `prefers-reduced-motion`,
 * which the stylesheet enforces rather than this component.
 */
export function RainOverlay({ weather }: RainOverlayProps) {
  if (!weather || !isRaining(weather)) return null;

  const mm = weather.precipitationMm ?? 0;
  // Heavier rain falls faster and shows more; drizzle stays a hint.
  const intensity = Math.min(1, mm / HEAVY_MM_PER_HOUR);

  return (
    <div
      className="rain"
      aria-hidden="true"
      style={
        {
          // Halved from the first attempt. Rain is context, not content - it
          // must never compete with the pins or the streets underneath it.
          "--rain-opacity": 0.08 + intensity * 0.12,
          "--rain-duration": `${1.1 - intensity * 0.5}s`,
        } as React.CSSProperties
      }
    />
  );
}
