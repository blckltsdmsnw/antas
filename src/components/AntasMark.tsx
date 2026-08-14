import { DEPTH_HEX } from "@/lib/depth/presentation";

/**
 * The mark: a person standing in water.
 *
 * This product's depth scale is not centimetres, it is body parts -
 * bukong-bukong, tuhod, baywang, dibdib, lampas sa ulo. Measuring a flood
 * against a human being is the genuinely distinctive idea in Antas, so the mark
 * is that idea as a shape. It says what the app *does*, which neither of the
 * two attempts before it managed.
 *
 * Rejected on the way here, both recorded in `foundations.md` §7b: five depth
 * bands in a rounded square (faithful to the legend, no silhouette, and the
 * graduations dissolved below ~24px), and the letter A flooded to its crossbar
 * (a nice coincidence, but it only ever said the name).
 *
 * The figure is cropped by the frame rather than floating inside it, and the
 * water crosses it. Both matter: a head-and-shoulders bust centred in a box
 * with space around it is the universal account-avatar glyph, and that is the
 * one thing this must not be mistaken for.
 */

const SIZE = 64;
const GROUND = "#0f172a";

/** Waist height. The water takes the accent, which is the waist band, so the
 *  colour and the level it sits at agree. Deeper bands are darker than the ink
 *  ground and would close up at icon sizes. */
const WATER = DEPTH_HEX.waist;

/**
 * Darker than the water, not lighter.
 *
 * The submerged half was first drawn in pale blue, which made a bright block
 * below the surface - and a bright block under a circle is an account avatar
 * again, whatever the water is doing. Under real floodwater a body is a shadow.
 * Sinking it below the water's own tone leaves the silhouette to the head and
 * shoulders above the line, which is the part that has to read.
 */
const SUBMERGED = "#0369a1";

/**
 * Chest height, and high in the frame on purpose. The first cut put the water
 * at the waist, low down, and the result was unmistakably an account avatar
 * with a blue base - a head-and-shoulders bust is the universal profile glyph.
 * Water crossing the body high, covering most of the field, is what makes it a
 * person standing in a flood instead.
 */
const WATERLINE = 31;

const HEAD = { cx: 32, cy: 13, r: 7 };

/** Head, shoulders and body, running off the bottom edge - a figure standing in
 *  something rather than a portrait framed inside it.
 *
 *  Deliberately large in the frame. An avatar glyph is always comfortably
 *  inset with air around it; a figure that crowds its own edges does not read
 *  that way, and filling the field was the cheapest remaining lever against
 *  the resemblance. */
const BODY = `M17 ${SIZE} L17 31 Q17 22 32 22 Q47 22 47 31 L47 ${SIZE} Z`;

/** The surface. Shallow on purpose: at 16px it flattens to a line anyway, and
 *  deeper troughs eat into the body at the sizes where it does resolve. */
const SURFACE = `M0 ${WATERLINE} q8 -3 16 0 t16 0 t16 0 t16 0 L${SIZE} ${SIZE} L0 ${SIZE} Z`;

interface AntasMarkProps {
  /** Rendered size in px. The viewBox is fixed, so this only scales. */
  size?: number;
  /** Give this only where the mark stands alone. Beside the wordmark it is
   *  decorative, and announcing "Antas" twice is noise on a screen reader. */
  title?: string;
  /**
   * `icon` is the full mark: ink ground, its own waterline at the waist.
   *
   * `plain` is the bare figure with no ground and no water, for the splash -
   * there the rising water does the submerging, and a mark carrying its own
   * fixed waterline underneath a moving one reads as two contradictory levels.
   */
  variant?: "icon" | "plain";
}

export function AntasMark({ size = 24, title, variant = "icon" }: AntasMarkProps) {
  const shared = {
    width: size,
    height: size,
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    role: title ? ("img" as const) : ("presentation" as const),
    "aria-hidden": title ? undefined : true,
    "aria-label": title,
    focusable: "false" as const,
  };

  if (variant === "plain") {
    return (
      <svg {...shared}>
        <g fill={GROUND}>
          <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
          <path d={BODY} />
        </g>
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <clipPath id="antas-mark-ground">
        <rect width={SIZE} height={SIZE} rx={14} ry={14} />
      </clipPath>

      {/* Above and below, so the figure is drawn twice in two flat colours
          rather than faded - no gradients and no transparency anywhere. */}
      <clipPath id="antas-mark-above">
        <rect width={SIZE} height={WATERLINE} />
      </clipPath>
      <clipPath id="antas-mark-below">
        <rect y={WATERLINE} width={SIZE} height={SIZE - WATERLINE} />
      </clipPath>

      <g clipPath="url(#antas-mark-ground)">
        <rect width={SIZE} height={SIZE} fill={GROUND} />
        <path d={SURFACE} fill={WATER} />

        <g fill="#ffffff" clipPath="url(#antas-mark-above)">
          <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
          <path d={BODY} />
        </g>

        <g fill={SUBMERGED} clipPath="url(#antas-mark-below)">
          <path d={BODY} />
        </g>
      </g>
    </svg>
  );
}
