"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { depthLabel, depthRank, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_VAR } from "@/lib/depth/presentation";

interface NearbyReport {
  id: string;
  depth: DepthLevel;
  reported_at: string;
  lat: number;
  lon: number;
  distance_m: number;
}

interface StreetHistoryProps {
  point: { lat: number; lon: number } | null;
}

const STREET_RADIUS_M = 150;

/** "kahapon" reads better than a date to someone deciding a route right now. */
function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "ngayon";
  if (days === 1) return "kahapon";
  return `${days} araw`;
}

export function StreetHistory({ point }: StreetHistoryProps) {
  const [reports, setReports] = useState<NearbyReport[] | null>(null);

  useEffect(() => {
    if (!point) {
      setReports(null);
      return;
    }

    createClient()
      .rpc("reports_near", {
        lat: point.lat,
        lon: point.lon,
        radius_m: STREET_RADIUS_M,
      })
      .then(({ data }) => setReports((data as NearbyReport[]) ?? []));
  }, [point]);

  if (!point) {
    return (
      <section className="history-sheet">
        <p className="sheet-hint">Pindutin ang mapa para makita ang kasaysayan.</p>
      </section>
    );
  }

  if (reports === null) {
    return (
      <section className="history-sheet">
        <p className="sheet-hint">Naghahanap...</p>
      </section>
    );
  }

  if (reports.length === 0) {
    return (
      <section className="history-sheet">
        <p className="sheet-hint">Walang naitalang baha sa lugar na ito.</p>
      </section>
    );
  }

  const deepest = reports.reduce((worst, report) =>
    depthRank(report.depth) > depthRank(worst.depth) ? report : worst,
  );

  return (
    <section className="history-sheet">
      <h2 className="sheet-count">{reports.length} report sa lugar na ito</h2>

      <p className="deepest">
        <span
          className="deepest-dot"
          style={{ background: DEPTH_VAR[deepest.depth] }}
        />
        <span className="deepest-label">
          Pinakamalalim: {depthLabel(deepest.depth).tl}
        </span>
      </p>

      <ul className="report-list">
        {reports.map((report) => (
          <li key={report.id} className="report-row">
            <span
              className="report-swatch"
              style={{ background: DEPTH_VAR[report.depth] }}
            />
            {depthLabel(report.depth).tl}
            <span className="report-when">{relativeDay(report.reported_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
