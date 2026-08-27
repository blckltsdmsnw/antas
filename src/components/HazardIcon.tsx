import type { HazardType } from "@/lib/hazard/types";

/**
 * One glyph per hazard, deliberately conventional.
 *
 * A wave, a flame, a cracked ground line, a car, a cross, an exclamation.
 * This UI was approved as usable by people who are not comfortable with apps,
 * and that audience recognises the obvious symbol, not the elegant one.
 *
 * `currentColor` throughout, so the caller decides colour: the icon says
 * WHAT, and colour is reserved for HOW BAD.
 */
const PATHS: Readonly<Record<HazardType, string>> = Object.freeze({
  flood:      "M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0 2 2 2 2v2H2v-4zm0-6c2-2 4-2 6 0s4 2 6 0 4-2 6 0v2c-2 2-4 2-6 0s-4-2-6 0-4 2-6 0v-2z",
  fire:       "M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-2-6 1-10z",
  earthquake: "M2 12h4l2-6 3 12 3-9 2 5 2-2h4",
  accident:   "M5 11l1.5-4h11L19 11h1v6h-2v-2H6v2H4v-6h1zm2 0h10l-1-3H8l-1 3zm0 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  medical:    "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3z",
  other:      "M11 3h2v11h-2V3zm0 14h2v3h-2v-3z",
});

const SIZE_PX = { sm: 16, md: 24, lg: 40 } as const;

interface HazardIconProps {
  hazard: HazardType;
  size: keyof typeof SIZE_PX;
  /** Announced to screen readers. Omit where the word is already beside it. */
  title?: string;
}

export function HazardIcon({ hazard, size, title }: HazardIconProps) {
  const px = SIZE_PX[size];
  const strokeOnly = hazard === "earthquake";
  return (
    <svg
      className="hazard-icon"
      data-hazard={hazard}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill={strokeOnly ? "none" : "currentColor"}
      stroke={strokeOnly ? "currentColor" : "none"}
      strokeWidth={strokeOnly ? 2 : undefined}
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[hazard]} />
    </svg>
  );
}
