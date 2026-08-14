import { DEPTH_LEVELS } from "@/lib/depth/scale";
import { DEPTH_HEX } from "@/lib/depth/presentation";

/**
 * The mark: a staff gauge.
 *
 * A staff gauge is the graduated post planted in a river to read its level by
 * eye - the physical instrument this app replaces with a crowd. So the mark is
 * that object, rather than the droplet or wave every other flood app reaches
 * for, neither of which can say *how deep*.
 *
 * The five bands are the depth scale itself, in scale order, pale at the top
 * and deepest at the foot. The icon on a home screen and the key on the map are
 * then the same object, and nothing new has to be learned to read it.
 *
 * The post sits on an ink ground rather than bleeding to the edge. The first
 * version was full-bleed, and its palest band vanished into a white browser
 * tab - the icon read as though the top had been cropped off. The ground also
 * makes it an object standing in something, which is what a gauge is.
 */

/** Shallowest first, so the bands paint top-down in scale order. */
const BANDS = [...DEPTH_LEVELS];

const SIZE = 64;
const GROUND = "#0f172a";

/** The post, inset from the ground. Deliberately broad: at favicon sizes a
 *  slender post collapses to a hairline and the colour signature goes with it. */
const POST_X = 12;
const POST_W = 40;
const POST_Y = 5;
const POST_H = 54;
const BAND_H = POST_H / BANDS.length;

/** Graduations, cut into the left edge of the post in the ground colour. Below
 *  roughly 24px they stop resolving and read as texture, which is the point:
 *  the silhouette still says "measuring post" without needing to be counted. */
const TICK_W = 12;
const TICK_H = 2.4;

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
      <rect width={SIZE} height={SIZE} rx={14} ry={14} fill={GROUND} />

      {/* Clipping rather than a rounded <rect> per band: the corner radius then
          belongs to the post, not to the top and bottom colours, so the scale
          reads as one continuous object. */}
      <clipPath id="antas-mark-post">
        <rect x={POST_X} y={POST_Y} width={POST_W} height={POST_H} rx={5} ry={5} />
      </clipPath>

      <g clipPath="url(#antas-mark-post)">
        {BANDS.map((level, i) => (
          <rect
            key={level}
            x={POST_X}
            y={POST_Y + i * BAND_H}
            width={POST_W}
            height={BAND_H}
            fill={DEPTH_HEX[level]}
          />
        ))}

        {/* One graduation per boundary between levels - four, not five. A tick
            at the foot of the post would mark a depth with no band below it. */}
        {BANDS.slice(1).map((level, i) => (
          <rect
            key={`tick-${level}`}
            x={POST_X}
            y={POST_Y + (i + 1) * BAND_H - TICK_H / 2}
            width={TICK_W}
            height={TICK_H}
            fill={GROUND}
          />
        ))}
      </g>
    </svg>
  );
}
