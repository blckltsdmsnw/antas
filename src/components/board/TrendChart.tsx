"use client";

import { useMemo, useState } from "react";
import { HAZARDS, type HazardType } from "@/lib/hazard/types";
import { hazardName } from "@/lib/hazard/name";
import { chartColour, hourColumns, type BoardGraph } from "@/lib/board/graph";
import { clockTime } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

/** Drawing area. The SVG scales to its container; these are unit-space. */
const W = 960;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 28, left: 32 };
const GAP = 2;
const HOURS = 48;

/**
 * Incidents per hour, last 48 hours, stacked by hazard.
 *
 * Hand-written SVG - two panels of this shape are a hundred and fifty lines
 * against a hundred kilobytes of charting library, in an app that must open
 * fast offline on a cheap phone. Thin bars, a 2px gap between stacked
 * segments, a recessive baseline, y ticks at 0 / mid / max, x labels every
 * six hours in Manila time. Hover on a bar shows the hour's breakdown; a
 * table under the chart carries the same numbers for anyone who cannot read
 * the bars, and a legend names every hue because colour is never the only
 * channel.
 */
export function TrendChart({ graph }: { graph: BoardGraph }) {
  const copy = useCopy();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const columns = useMemo(() => hourColumns(graph.hours, new Date(), HOURS), [graph.hours]);
  const max = Math.max(1, ...columns.map((c) => c.total));
  const any = columns.some((c) => c.total > 0);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / HOURS;
  const barW = Math.max(2, slot - GAP);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const present = new Set(graph.hours.map((h) => h.hazard));
  const legend: (HazardType | null)[] = [...HAZARDS.filter((h) => present.has(h)), ...(present.has(null) ? [null] : [])];
  const nameOf = (h: HazardType | null) => (h === null ? copy.board.unspecifiedHazard : hazardName(h, copy.hazard));

  if (!any) {
    return (
      <section className="board-graph-panel">
        <h2 className="board-column-title">{copy.board.graphPerHour}</h2>
        <p className="board-card-meta">{copy.board.graphEmpty}</p>
      </section>
    );
  }

  return (
    <section className="board-graph-panel">
      <h2 className="board-column-title">{copy.board.graphPerHour}</h2>

      <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img" aria-label={copy.board.graphPerHour}>
        {/* y axis: three ticks, recessive. */}
        {[0, Math.ceil(max / 2), max].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={PAD.left - 6} y={y(v) + 4} className="trend-tick" textAnchor="end">{v}</text>
          </g>
        ))}

        {columns.map((col, i) => {
          const x = PAD.left + i * slot;
          let acc = 0;
          const label = i % 6 === 0 ? clockTime(col.hour.toISOString()) : null;
          return (
            <g
              key={col.hour.getTime()}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* Hit target wider than the bar, so a thin bar is still hoverable. */}
              <rect x={x} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {col.segments.map((s) => {
                const y1 = y(acc + s.count);
                const y0 = y(acc);
                acc += s.count;
                return (
                  <rect
                    key={String(s.hazard)}
                    data-testid="trend-segment"
                    x={x + GAP / 2}
                    y={y1}
                    width={barW}
                    height={Math.max(0, y0 - y1 - GAP)}
                    rx={2}
                    fill={chartColour(s.hazard)}
                  />
                );
              })}
              {label && (
                <text x={x + slot / 2} y={H - 8} className="trend-tick" textAnchor="middle">{label}</text>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && columns[hover].total > 0 && (
        <p className="board-card-meta trend-tooltip" role="status">
          {clockTime(columns[hover].hour.toISOString())} ·{" "}
          {columns[hover].segments.map((s) => `${nameOf(s.hazard)} ${s.count}`).join(" · ")}
        </p>
      )}

      <ul className="trend-legend" aria-label={copy.board.graphPerHour}>
        {legend.map((h) => (
          <li key={String(h)}>
            <span className="trend-swatch" style={{ background: chartColour(h) }} aria-hidden="true" />
            {nameOf(h)}
          </li>
        ))}
      </ul>

      <button type="button" className="quiet-link" onClick={() => setTable((t) => !t)}>
        {copy.board.graphTable}
      </button>
      {/* Rendered only when asked for: a hidden table still matches by text, and
          its hazard headers would collide with the legend's names. */}
      {table && (
        <table className="trend-table">
          <thead>
            <tr>
              <th>{copy.board.graphHour}</th>
              {legend.map((h) => <th key={String(h)}>{nameOf(h)}</th>)}
              <th>{copy.board.graphCount}</th>
            </tr>
          </thead>
          <tbody>
            {columns.filter((c) => c.total > 0).map((c) => (
              <tr key={c.hour.getTime()}>
                <td>{clockTime(c.hour.toISOString())}</td>
                {legend.map((h) => (
                  <td key={String(h)}>{c.segments.find((s) => s.hazard === h)?.count ?? 0}</td>
                ))}
                <td>{c.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
