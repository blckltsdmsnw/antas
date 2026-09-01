"use client";

import type { BoardGraph } from "@/lib/board/graph";
import { useCopy } from "@/lib/i18n/context";

/**
 * The barangays under most pressure in the window, worst first.
 *
 * A ranked list with a proportional bar, not a chart with axes: the
 * question is "where first", and a list answers it in reading order. One
 * hue - magnitude, not identity - and the number printed beside every bar,
 * so the bar is a glance and the number is the fact.
 */
export function BarangayRanking({ graph }: { graph: BoardGraph }) {
  const copy = useCopy();
  const max = Math.max(1, ...graph.barangays.map((b) => b.count));

  return (
    <section className="board-graph-panel">
      <h2 className="board-column-title">{copy.board.graphBarangays}</h2>
      {graph.barangays.length === 0 ? (
        <p className="board-card-meta">{copy.board.graphEmpty}</p>
      ) : (
        <ol className="barangay-ranking">
          {graph.barangays.map((b) => (
            <li key={b.barangay}>
              <span className="barangay-ranking-name">{b.barangay}</span>
              <span className="barangay-ranking-bar" aria-hidden="true">
                <span style={{ width: `${(b.count / max) * 100}%` }} />
              </span>
              <span className="barangay-ranking-count">{b.count}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
