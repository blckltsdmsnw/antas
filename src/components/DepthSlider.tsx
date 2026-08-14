"use client";

import { DEPTH_LEVELS, depthLabel, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_SHORT_LABEL, depthRangeLabel } from "@/lib/depth/presentation";

/**
 * The gauge is a body, not a column.
 *
 * The scale in this product is body parts - bukong-bukong, tuhod, baywang,
 * dibdib, lampas sa ulo - so the control that sets it should be a body. The
 * previous version was a vertical water column with labels beside it: a fine
 * gauge, and one abstraction away from the thing being measured. Here the water
 * rises up a figure and the answer is read off it the way it would be read off
 * yourself, standing in the street.
 *
 * TWO CONTROLS, ONE STATE, and the pairing is the point. The list of five rows
 * is the real control - ordinary buttons, so keyboard operable, legible to a
 * screen reader, and 48px tall as `foundations.md` §7 requires. The figure is a
 * picture of what the list currently says. A drag gesture on a silhouette can
 * be none of those things by itself, which is why it is not the only way in.
 *
 * Deepest first, top to bottom, so the list reads worst-case down - the same
 * order as the map legend, for the same reason.
 */

interface DepthSliderProps {
  value: DepthLevel;
  onChange: (level: DepthLevel) => void;
}

/**
 * Where the surface sits, in the figure's own coordinates.
 *
 * These are viewBox units, not percentages of the container, and that is the
 * whole point. Two earlier attempts got this wrong: dividing the box into even
 * fifths put "dibdib" at the neck, and hand-converting anatomy into percentages
 * drifted again because the SVG letterboxes inside its box rather than filling
 * it. A control that claims a depth one level worse than the one selected is
 * exactly the error this product exists to prevent.
 *
 * Expressed against the drawing, the numbers cannot drift: the figure's legs
 * run y=88 to 144, its torso y=40 to 92, its head is centred at y=22. So the
 * knee is mid-leg, the waist is the base of the torso, the chest is its upper
 * third - and both figure and water scale together whatever size the box is.
 */
const WATER_Y: Record<DepthLevel, number> = {
  ankle: 138,
  knee: 116,
  waist: 92,
  chest: 62,
  above_head: 0,
};

export function DepthSlider({ value, onChange }: DepthSliderProps) {
  const label = depthLabel(value);
  const deepestFirst = [...DEPTH_LEVELS].reverse();

  // Carries no instruction of its own: the page above already says what to do,
  // and a control that explains itself twice reads as harder than it is.
  return (
    <div className="body-gauge">
      <div className="body-gauge-row">
        {/* Decorative: everything it conveys is also in the list beside it and
            in the readout below, so someone who cannot see it loses nothing. */}
        <div className="body-figure" aria-hidden="true">
          <svg viewBox="0 0 100 150" className="body-figure-svg">
            {/* Head, torso, arms, legs - blunt shapes on purpose. This has to
                read at a glance, in rain, at arm's length. */}
            <g className="body-person">
              <circle cx="50" cy="22" r="14" />
              <rect x="34" y="40" width="32" height="52" rx="12" />
              <rect x="18" y="44" width="13" height="44" rx="6.5" />
              <rect x="69" y="44" width="13" height="44" rx="6.5" />
              <rect x="36" y="88" width="12" height="56" rx="6" />
              <rect x="52" y="88" width="12" height="56" rx="6" />
            </g>

            {/* Over the figure, multiplied, so what is under the surface
                darkens the way a submerged thing does rather than being hidden
                behind a panel. Translated rather than resized: `transform`
                animates everywhere, where SVG geometry attributes do not. */}
            <g
              className="body-water"
              style={{ transform: `translateY(${WATER_Y[value]}px)` }}
            >
              <rect x="0" y="0" width="100" height="300" />
            </g>

            <g
              className="body-surface"
              style={{ transform: `translateY(${WATER_Y[value]}px)` }}
            >
              <rect x="0" y="0" width="100" height="2.5" />
            </g>
          </svg>
        </div>

        <ul className="body-levels">
          {deepestFirst.map((level) => (
            <li key={level}>
              <button
                type="button"
                className="body-level"
                data-active={level === value}
                aria-pressed={level === value}
                onClick={() => onChange(level)}
              >
                {DEPTH_SHORT_LABEL[level]}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="gauge-readout">
        <strong className="gauge-readout-label">{label.tl}</strong>
        <span className="gauge-readout-en">{label.en}</span>
        <span className="gauge-readout-cm">{depthRangeLabel(value)}</span>
      </p>
    </div>
  );
}
