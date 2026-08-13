import { DEPTH_LEVELS } from "@/lib/depth/scale";
import { DEPTH_SHORT_LABEL, DEPTH_VAR } from "@/lib/depth/presentation";

/**
 * Without this, a first-time visitor sees blue and purple pins with no way to
 * know what they mean - and the depth scale is the entire product. Deepest is
 * listed first so the key reads worst-case down, like a warning.
 */
export function MapLegend() {
  return (
    <aside className="legend" aria-label="Kulay ng lalim ng tubig">
      <p className="legend-title">Lalim ng tubig</p>
      <ul className="legend-list">
        {[...DEPTH_LEVELS].reverse().map((level) => (
          <li key={level} className="legend-row">
            <span
              className="legend-swatch"
              style={{ background: DEPTH_VAR[level] }}
            />
            {DEPTH_SHORT_LABEL[level]}
          </li>
        ))}
      </ul>
    </aside>
  );
}
