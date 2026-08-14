import { DEPTH_HEX } from "@/lib/depth/presentation";

/**
 * The mark: a map pin holding a flooded street.
 *
 * The city is the ruler. A waterline crossing buildings of three different
 * heights gives a *reading* - the low block nearly gone, the tall one barely
 * wet - which is the same mechanism as the staff gauge this started as, except
 * legible at icon size. The pin frames it as "this place, right here", which is
 * what the app is: not that it is flooding somewhere, but how deep it is here.
 *
 * Three marks were tried and discarded before this; `foundations.md` §7b keeps
 * the reasoning, since each failed for a different and instructive reason.
 *
 * Deliberately fewer shapes than the reference it came from: three buildings
 * rather than six, two wave bands rather than four, no backdrop panel and no
 * drop shadow. The detail in the original was hiding the idea, not carrying it.
 */

const SIZE = 64;
const INK = "#0f172a";
const PAPER = "#ffffff";

/**
 * A pale ground, not the ink one the earlier marks used.
 *
 * The pin is ink, and ink on ink merged: the outline disappeared into the field
 * and all that survived at 16px was the white window floating in a dark square.
 * The reference this came from had a pale backdrop for precisely that reason.
 * `ankle` is the palette's own pale blue, so nothing new is introduced.
 */
const GROUND = DEPTH_HEX.ankle;

/** The pin, and the same shape inset to make its window. Drawn as two filled
 *  teardrops rather than one stroked path: a stroke of this weight distorts at
 *  the tip, where the curve is tightest.
 *
 *  Sized to crowd the frame. The first cut left a wide margin, which at icon
 *  sizes spends most of the pixels on empty ground. */
const PIN_OUTER =
  "M32 61 C25 50 13 38 13 24 A19 19 0 1 1 51 24 C51 38 39 50 32 61 Z";
const PIN_INNER =
  "M32 51 C28 43 18.5 34 18.5 24 A13.5 13.5 0 1 1 45.5 24 C45.5 34 36 43 32 51 Z";

/**
 * Three heights, because one height cannot express a level. What makes this
 * read as depth rather than as weather is that the same waterline leaves
 * different amounts of each building showing.
 */
const BUILDINGS = [
  { x: 22, w: 6, y: 19 },
  { x: 29, w: 6.5, y: 14 },
  { x: 36.5, w: 6, y: 21 },
];

/** Where the water sits inside the pin, and the second band below it. Two
 *  bands, not four: at 24px the extra ones merge into a single blue mass. */
const WATERLINE = 29;
const WATERLINE_DEEP = 36;

/** The street the buildings stand on. Without it they ran to the pin's tip and
 *  filled the taper, which reads as a solid blob rather than a city - visible
 *  in the `plain` variant, where no water covers their feet. */
const STREET = 37;

function surface(y: number): string {
  return `M0 ${y} q6 -2.4 12 0 t12 0 t12 0 t12 0 t12 0 L${SIZE} ${SIZE} L0 ${SIZE} Z`;
}

interface AntasMarkProps {
  /** Rendered size in px. The viewBox is fixed, so this only scales. */
  size?: number;
  /** Give this only where the mark stands alone. Beside the wordmark it is
   *  decorative, and announcing "Antas" twice is noise on a screen reader. */
  title?: string;
  /**
   * `icon` is the full mark: ink ground, water already risen up the buildings.
   *
   * `plain` is the pin with the street still dry and no ground, for the splash -
   * there the rising water does the flooding, and a mark carrying its own fixed
   * waterline underneath a moving one shows two contradictory levels at once.
   */
  variant?: "icon" | "plain";
}

export function AntasMark({ size = 24, title, variant = "icon" }: AntasMarkProps) {
  // Namespaced per variant so the two marks on screen at once - the header's
  // and the splash's - cannot resolve each other's clip paths.
  const clipId = `antas-pin-${variant}`;

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
      <clipPath id={clipId}>
        <path d={PIN_INNER} />
      </clipPath>

      {variant === "icon" && (
        <rect width={SIZE} height={SIZE} rx={14} ry={14} fill={GROUND} />
      )}

      <path d={PIN_OUTER} fill={INK} />
      <path d={PIN_INNER} fill={PAPER} />

      <g clipPath={`url(#${clipId})`}>
        {BUILDINGS.map((building) => (
          <rect
            key={building.x}
            x={building.x}
            y={building.y}
            width={building.w}
            height={STREET - building.y}
            fill={INK}
          />
        ))}

        {/* Over the buildings, so the water takes their feet. */}
        {variant === "icon" && (
          <>
            <path d={surface(WATERLINE)} fill={DEPTH_HEX.waist} />
            <path d={surface(WATERLINE_DEEP)} fill={DEPTH_HEX.chest} />
          </>
        )}
      </g>
    </svg>
  );
}
