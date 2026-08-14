/**
 * The mark: a map pin holding a flooded street.
 *
 * The city is the ruler. One waterline crossing buildings of different heights
 * gives a *reading* - the low block nearly gone, the tall one barely wet - and
 * the pin frames it as "this place, right here", which is the question the app
 * answers: not that it is flooding somewhere, but how deep it is here.
 *
 * Traced from a reference Elijah generated and approved. An earlier pass
 * stripped it hard for legibility at 16px - three buildings, two flat bands, no
 * base - and lost the thing he had chosen it for. Fidelity to the approved
 * drawing wins here; see `foundations.md` §7b for what that costs and why the
 * trade was made deliberately rather than by accident.
 */

const SIZE = 64;
const INK = "#0f172a";
const PAPER = "#ffffff";

/**
 * The palette's `ankle` blue lightened toward white, matching the reference's
 * near-white ground. A saturated pale blue behind an ink pin fights it; this
 * recedes and lets the pin carry the silhouette.
 */
const GROUND = "#cbedfe";

/** Waves, shallowest first, so the water deepens downward like the scale. */
const BAND_KNEE = "#38bdf8";
const BAND_WAIST = "#0284c7";
const BAND_CHEST = "#1e40af";

/** The pin, and the same shape inset to make its window. Two filled teardrops
 *  rather than one stroked path: a stroke of this weight distorts at the tip,
 *  where the curve is tightest. */
const PIN_OUTER =
  "M32 57 C25.5 47 13 38 13 26 A19 19 0 1 1 51 26 C51 38 38.5 47 32 57 Z";
const PIN_INNER =
  "M32 48 C28 41 17.5 35 17.5 26 A14.5 14.5 0 1 1 46.5 26 C46.5 35 36 41 32 48 Z";

/**
 * A skyline, not three blocks. Widths and heights both vary, because a row of
 * identical rectangles reads as a bar chart - and the varied heights are what
 * make one waterline express a range of depths rather than a single fact.
 */
const BUILDINGS = [
  { x: 19.5, w: 5, y: 24 },
  { x: 24.8, w: 4, y: 19 },
  { x: 29.1, w: 6, y: 14 },
  { x: 35.4, w: 4.5, y: 21 },
  { x: 40.2, w: 5.5, y: 23 },
];

/** Where the buildings stand. Without it they ran to the pin's tip and filled
 *  the taper, which reads as a solid blob rather than a city. */
const STREET = 38;

/** Three bands, each offset so their crests do not stack into one edge. */
const BANDS = [
  { y: 30, shift: 0, fill: BAND_KNEE },
  { y: 35, shift: 4.5, fill: BAND_WAIST },
  { y: 40, shift: 9, fill: BAND_CHEST },
];

/**
 * Amplitude is the whole point of this shape. The previous version used 2.4
 * over a 64 unit box, which flattened into a ruled line - water has to look
 * like water, and a straight edge is the one thing it must not be.
 */
function surface(y: number, shift: number): string {
  const x = -shift;
  return `M${x} ${y} q6 -4.4 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 L${SIZE} ${SIZE} L${x} ${SIZE} Z`;
}

interface AntasMarkProps {
  /** Rendered size in px. The viewBox is fixed, so this only scales. */
  size?: number;
  /** Give this only where the mark stands alone. Beside the wordmark it is
   *  decorative, and announcing "Antas" twice is noise on a screen reader. */
  title?: string;
  /**
   * `icon` is the full mark: pale ground, water already risen up the buildings.
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

      {/* The pin's contact with the ground. Drawn, not a CSS shadow - it is a
          shape in the composition rather than an effect, which is why it does
          not fall foul of the no-shadows rule in §8. */}
      <ellipse cx={32} cy={57.5} rx={13.5} ry={2.2} fill={INK} />

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
        {variant === "icon" &&
          BANDS.map((band) => (
            <path key={band.y} d={surface(band.y, band.shift)} fill={band.fill} />
          ))}
      </g>
    </svg>
  );
}
