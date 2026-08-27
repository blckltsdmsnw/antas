"use client";

import { DEPTH_LEVELS } from "@/lib/depth/scale";
import { DEPTH_VAR } from "@/lib/depth/presentation";
import { depthShortName } from "@/lib/depth/name";
import { HAZARDS } from "@/lib/hazard/types";
import { hazardName } from "@/lib/hazard/name";
import { HazardIcon } from "@/components/HazardIcon";
import { useCopy } from "@/lib/i18n/context";

/**
 * Without this, a first-time visitor sees blue and purple pins with no way to
 * know what they mean - and the depth scale is the entire product. Deepest is
 * listed first so the key reads worst-case down, like a warning.
 *
 * The hazard rows beneath it answer the other half: the icon says WHAT a pin
 * is, and this is where that vocabulary is taught. In `HAZARDS` order, so the
 * key always agrees with the picker and the graph without coordinating.
 */
export function MapLegend() {
  const copy = useCopy();

  return (
    <aside className="legend" aria-label={copy.map.legendLabel}>
      <p className="legend-title">{copy.map.legendTitle}</p>
      <ul className="legend-list">
        {[...DEPTH_LEVELS].reverse().map((level) => (
          <li key={level} className="legend-row">
            <span
              className="legend-swatch"
              style={{ background: DEPTH_VAR[level] }}
            />
            {depthShortName(level, copy.map)}
          </li>
        ))}
      </ul>
      <p className="legend-note">{copy.map.legendDarkerWorse}</p>
      <ul className="legend-list">
        {HAZARDS.map((hazard) => (
          <li key={hazard} className="legend-row">
            {/* The word follows right after, so the icon does not repeat its
                own name to a screen reader - see `HazardIcon`. */}
            <HazardIcon hazard={hazard} size="sm" />
            {hazardName(hazard, copy.hazard)}
          </li>
        ))}
      </ul>
    </aside>
  );
}
