import { DEPTH_HEX } from "@/lib/depth/presentation";

/**
 * The mark: the letter A, flooded to its crossbar.
 *
 * The A already has a horizontal bar across it, so the bar is made to do double
 * duty as the waterline. That is the whole idea, and it is why this works where
 * the previous mark did not: it names the app and states the subject in one
 * shape, and the coincidence is the thing anyone remembers.
 *
 * What it replaces was five colour bands in a rounded square. That was faithful
 * to the legend and useless as a logo - a rounded rectangle has no silhouette,
 * the graduations stopped resolving below about 24px, and what reached the user
 * at icon size was stripes in a box.
 *
 * Flat fills only, per `foundations.md` §8: no gradients anywhere in this
 * product. The submerged half of the letter takes a pale depth blue rather than
 * white, which is what reads as "under water" without shading or transparency.
 */

const SIZE = 64;
const GROUND = "#0f172a";
const WATER = DEPTH_HEX.waist;
const SUBMERGED = DEPTH_HEX.ankle;

/** Where the crossbar sits, and therefore where the water sits. */
const WATERLINE = 39;

/** The letter, as strokes rather than an outline: a font cannot be relied on
 *  inside an SVG that ships as a favicon. Butt caps keep the feet flat. */
const LETTER = `M16 52 L32 14 L48 52`;
const CROSSBAR = `M21.5 ${WATERLINE} L42.5 ${WATERLINE}`;

/**
 * The water's surface, waved rather than ruled. A straight edge reads as a
 * progress bar; this has to read as water. Amplitude is deliberately shallow -
 * at 16px it flattens to a line anyway, and anything deeper turns the crossbar
 * into a scribble at the sizes where it still resolves.
 */
const SURFACE =
  `M0 ${WATERLINE} q8 -3.2 16 0 t16 0 t16 0 t16 0 L64 64 L0 64 Z`;

interface AntasMarkProps {
  /** Rendered size in px. The viewBox is fixed, so this only scales. */
  size?: number;
  /** Give this only where the mark stands alone. Beside the wordmark it is
   *  decorative, and announcing "Antas" twice is noise on a screen reader. */
  title?: string;
}

export function AntasMark({ size = 24, title }: AntasMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <clipPath id="antas-mark-ground">
        <rect width={SIZE} height={SIZE} rx={14} ry={14} />
      </clipPath>

      {/* Above and below the waterline, so the letter can be drawn twice in two
          colours rather than faded - flat fills only. */}
      <clipPath id="antas-mark-above">
        <rect width={SIZE} height={WATERLINE} />
      </clipPath>
      <clipPath id="antas-mark-below">
        <rect y={WATERLINE} width={SIZE} height={SIZE - WATERLINE} />
      </clipPath>

      <g clipPath="url(#antas-mark-ground)">
        <rect width={SIZE} height={SIZE} fill={GROUND} />
        <path d={SURFACE} fill={WATER} />

        <g
          fill="none"
          strokeWidth={8.5}
          strokeLinecap="butt"
          strokeLinejoin="miter"
          clipPath="url(#antas-mark-above)"
        >
          <path d={LETTER} stroke="#ffffff" />
          <path d={CROSSBAR} stroke="#ffffff" strokeWidth={7} />
        </g>

        <g
          fill="none"
          strokeWidth={8.5}
          strokeLinecap="butt"
          strokeLinejoin="miter"
          clipPath="url(#antas-mark-below)"
        >
          <path d={LETTER} stroke={SUBMERGED} />
        </g>
      </g>
    </svg>
  );
}
