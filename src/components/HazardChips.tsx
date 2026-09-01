// src/components/HazardChips.tsx
"use client";

import { HAZARDS, type HazardType } from "@/lib/hazard/types";
import { hazardName } from "@/lib/hazard/name";
import { HazardIcon } from "./HazardIcon";
import { useCopy } from "@/lib/i18n/context";

/**
 * An optional row of hazards on /sos.
 *
 * Six chips, icon and word, nothing preselected, and NOTHING REQUIRED: the
 * three-second hold works whether or not one is chosen. Tapping the chosen
 * chip again clears it, because "I did not say" is a real answer and the
 * console shows it as one rather than guessing.
 *
 * /sos deliberately stopped asking for a depth because seconds matter
 * there. This row costs no seconds: it is glanceable, optional, and above
 * the hold rather than in its way.
 */
export function HazardChips({
  value,
  onChange,
}: {
  value: HazardType | null;
  onChange: (h: HazardType | null) => void;
}) {
  const copy = useCopy();
  return (
    <div className="hazard-chips" role="radiogroup" aria-label={copy.sos.hazardPrompt}>
      <p className="field-label">{copy.sos.hazardPrompt}</p>
      <div className="hazard-chips-row">
        {HAZARDS.map((h) => (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={value === h}
            className="hazard-chip"
            data-hazard={h}
            onClick={() => onChange(value === h ? null : h)}
          >
            <HazardIcon hazard={h} size="sm" />
            {hazardName(h, copy.hazard)}
          </button>
        ))}
      </div>
    </div>
  );
}
