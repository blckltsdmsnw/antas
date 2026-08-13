"use client";

import {
  DEPTH_LEVELS,
  depthLabel,
  depthRank,
  type DepthLevel,
} from "@/lib/depth/scale";

interface DepthSliderProps {
  value: DepthLevel;
  onChange: (level: DepthLevel) => void;
}

export function DepthSlider({ value, onChange }: DepthSliderProps) {
  const label = depthLabel(value);

  return (
    <div>
      <input
        type="range"
        min={0}
        max={DEPTH_LEVELS.length - 1}
        step={1}
        value={depthRank(value)}
        aria-label="Gaano kalalim ang tubig?"
        aria-valuetext={label.tl}
        onChange={(e) => onChange(DEPTH_LEVELS[Number(e.target.value)])}
      />
      <p>{label.tl}</p>
      <p>{label.en}</p>
    </div>
  );
}
