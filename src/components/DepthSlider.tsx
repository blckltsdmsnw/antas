"use client";

import {
  DEPTH_LEVELS,
  depthLabel,
  depthRangeCm,
  depthRank,
  type DepthLevel,
} from "@/lib/depth/scale";
import { DEPTH_SHORT_LABEL, DEPTH_VAR } from "@/lib/depth/presentation";

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
  const range = depthRangeCm(value);

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
