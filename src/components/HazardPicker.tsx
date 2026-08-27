"use client";

import { HAZARDS, type HazardType } from "@/lib/hazard/types";
import { hazardName } from "@/lib/hazard/name";
import { HazardIcon } from "./HazardIcon";
import { useCopy } from "@/lib/i18n/context";

/**
 * The first tap of a report: what is happening.
 *
 * Six large targets, icon above word, no scrolling. Nothing is preselected,
 * because a default hazard would be a guess put in somebody's mouth.
 */
export function HazardPicker({ onPick }: { onPick: (h: HazardType) => void }) {
  const copy = useCopy();
  return (
    <div className="hazard-picker">
      <h2 className="task-title">{copy.hazard.pickPrompt}</h2>
      <div className="hazard-grid">
        {HAZARDS.map((h) => (
          <button
            key={h}
            type="button"
            className="hazard-choice"
            data-hazard={h}
            onClick={() => onPick(h)}
          >
            <HazardIcon hazard={h} size="lg" />
            <span>{hazardName(h, copy.hazard)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
