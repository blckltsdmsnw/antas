"use client";

import {
  DEPTH_LEVELS,
  depthLabel,
  depthRangeCm,
  depthRank,
  type DepthLevel,
} from "@/lib/depth/scale";

interface DepthSliderProps {
  value: DepthLevel;
  onChange: (level: DepthLevel) => void;
}

/** Matches the ramp in globals.css and FloodMap. */
const LEVEL_COLOR: Record<DepthLevel, string> = {
  ankle: "var(--depth-ankle)",
  knee: "var(--depth-knee)",
  waist: "var(--depth-waist)",
  chest: "var(--depth-chest)",
  above_head: "var(--depth-above-head)",
};

/**
 * Short forms for the legend. Deliberately not the full `depthLabel` strings —
 * the readout below already shows those, and repeating them would put the same
 * text on screen twice.
 */
const LEGEND_LABEL: Record<DepthLevel, string> = {
  ankle: "Bukong-bukong",
  knee: "Tuhod",
  waist: "Baywang",
  chest: "Dibdib",
  above_head: "Lampas sa ulo",
};

/** Percentage of the column each level occupies, shallowest at the bottom. */
function fillPercent(level: DepthLevel): number {
  return ((depthRank(level) + 1) / DEPTH_LEVELS.length) * 100;
}

export function DepthSlider({ value, onChange }: DepthSliderProps) {
  const label = depthLabel(value);
  const range = depthRangeCm(value);

  return (
    <div>
      <div className="gauge">
        <div
          className="gauge-column"
          style={
            {
              "--fill": `${fillPercent(value)}%`,
              "--water-top": LEVEL_COLOR[value],
            } as React.CSSProperties
          }
        >
          <div className="gauge-water" />

          <div className="gauge-ticks">
            {DEPTH_LEVELS.map((level) => (
              <span
                key={level}
                className="gauge-tick"
                style={{ bottom: `${fillPercent(level)}%` }}
              />
            ))}
          </div>

          <input
            className="gauge-input"
            type="range"
            min={0}
            max={DEPTH_LEVELS.length - 1}
            step={1}
            value={depthRank(value)}
            aria-label="Gaano kalalim ang tubig?"
            aria-valuetext={label.tl}
            onChange={(e) => onChange(DEPTH_LEVELS[Number(e.target.value)])}
          />
        </div>

        <div className="gauge-legend" aria-hidden="true">
          {DEPTH_LEVELS.map((level) => (
            <span
              key={level}
              className="gauge-legend-item"
              data-active={level === value}
              style={{ bottom: `${fillPercent(level)}%` }}
            >
              <span className="gauge-legend-rule" />
              {LEGEND_LABEL[level]}
            </span>
          ))}
        </div>
      </div>

      <p className="gauge-readout">
        <strong className="gauge-readout-label">{label.tl}</strong>
        <span className="gauge-readout-en">{label.en}</span>
        <span className="gauge-readout-cm">
          {range.maxCm === null
            ? `${range.minCm} cm pataas`
            : `${range.minCm}–${range.maxCm} cm`}
        </span>
      </p>
    </div>
  );
}
