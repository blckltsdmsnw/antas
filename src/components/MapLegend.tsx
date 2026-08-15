"use client";

import { DEPTH_LEVELS } from "@/lib/depth/scale";
import { DEPTH_VAR } from "@/lib/depth/presentation";
import { depthShortName } from "@/lib/depth/name";
import { useCopy } from "@/lib/i18n/context";

/**
 * Without this, a first-time visitor sees blue and purple pins with no way to
 * know what they mean - and the depth scale is the entire product. Deepest is
 * listed first so the key reads worst-case down, like a warning.
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
    </aside>
  );
}
