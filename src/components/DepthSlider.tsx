"use client";

import {
  DEPTH_LEVELS,
  depthLabel,
  depthRank,
  type DepthLevel,
} from "@/lib/depth/scale";
import {
  DEPTH_SHORT_LABEL,
  DEPTH_VAR,
  depthRangeLabel,
} from "@/lib/depth/presentation";

interface DepthSliderProps {
  value: DepthLevel;
  onChange: (level: DepthLevel) => void;
}

/** Percentage of the column each level occupies, shallowest at the bottom. */
function fillPercent(level: DepthLevel): number {
  return ((depthRank(level) + 1) / DEPTH_LEVELS.length) * 100;
}

export function DepthSlider({ value, onChange }: DepthSliderProps) {
  const label = depthLabel(value);

  return (
    <div>
      <div className="gauge">
        <div
          className="gauge-column"
          style={
            {
              "--fill": `${fillPercent(value)}%`,
              "--water-top": DEPTH_VAR[value],
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

        {/* Labels reach the full width as ruler graduations - see the leader
            line in `.gauge-legend-item::after`. That is what fills the space
            beside the track; the column used to end at its longest word. */}
        <div className="gauge-legend" aria-hidden="true">
          {DEPTH_LEVELS.map((level) => (
            <span
              key={level}
              className="gauge-legend-item"
              data-active={level === value}
              style={{ bottom: `${fillPercent(level)}%` }}
            >
              <span className="gauge-legend-rule" />
              {DEPTH_SHORT_LABEL[level]}
            </span>
          ))}
        </div>
      </div>

      {/* Full width, under both columns. Tucking it into the right-hand column
          only moved the empty space to the bottom left. */}
      <p className="gauge-readout">
        <strong className="gauge-readout-label">{label.tl}</strong>
        <span className="gauge-readout-en">{label.en}</span>
        <span className="gauge-readout-cm">{depthRangeLabel(value)}</span>
      </p>
    </div>
  );
}
