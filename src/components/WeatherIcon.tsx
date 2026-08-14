import type { WeatherKind } from "@/lib/env/current-weather";

/**
 * A glyph for the condition the strip is naming.
 *
 * MONOCHROME, in `currentColor`, and that is a rule rather than a shortage of
 * effort. The depth ramp is the only saturated colour in this product
 * (foundations §2), and a yellow sun beside a blue raindrop would put a second
 * colour system on the map competing with the one that means "chest-deep". The
 * icons are told apart by silhouette, which is what an icon is for.
 *
 * Nor do they move. Foundations §8 allows no animation beyond 150ms feedback,
 * and falling raindrops on a flood map would be decoration in the one place
 * this product has been careful not to decorate.
 *
 * They inherit the strip's colour, so the night map gets them for free.
 */

interface WeatherIconProps {
  kind: WeatherKind;
}

/** Shared cloud outline: five of the seven conditions are a cloud plus water. */
const CLOUD =
  "M7 15.5a3.5 3.5 0 0 1 .3-6.99 5 5 0 0 1 9.62 1.02A3.25 3.25 0 0 1 16.5 15.5Z";

export function WeatherIcon({ kind }: WeatherIconProps) {
  return (
    <svg
      className="weather-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative: the condition is already written beside it in words, so a
      // screen reader announcing both would say everything twice.
      aria-hidden="true"
      focusable="false"
    >
      {kind === "clear" && (
        <>
          <circle cx="12" cy="12" r="4" />
          {/* Eight rays, short and even - a sun, not a starburst. */}
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </>
      )}

      {kind === "cloudy" && <path d={CLOUD} />}

      {kind === "fog" && (
        <>
          <path d={CLOUD} />
          {/* Horizontal bars beneath: haze reads as layers, not as falling. */}
          <path d="M5 19h6M13 19h6M8 22h8" />
        </>
      )}

      {kind === "drizzle" && (
        <>
          <path d={CLOUD} />
          {/* Short, sparse ticks. Ambon is light and intermittent. */}
          <path d="M9 18.5v1.5M12 18.5v1.5M15 18.5v1.5" />
        </>
      )}

      {kind === "rain" && (
        <>
          <path d={CLOUD} />
          {/* Longer, slanted strokes - the same slant the map's rain uses. */}
          <path d="M8.5 18l-1 3M12 18l-1 3M15.5 18l-1 3" />
        </>
      )}

      {kind === "downpour" && (
        <>
          <path d={CLOUD} />
          {/* Four strokes rather than three, reaching further down. The
              difference from `rain` has to be legible at 18px. */}
          <path d="M7.5 17.5l-1.5 4M10.5 17.5l-1.5 4M13.5 17.5l-1.5 4M16.5 17.5l-1.5 4" />
        </>
      )}

      {kind === "storm" && (
        <>
          <path d={CLOUD} />
          {/* A bolt, filled, because an outline at this size closes up. */}
          <path
            d="M13 16.5l-4 4.5h3l-1 3 4-4.5h-3z"
            fill="currentColor"
            stroke="none"
          />
        </>
      )}
    </svg>
  );
}
