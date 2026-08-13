"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MapReport } from "@/components/FloodMap";
import { depthLabel, depthRank, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_VAR } from "@/lib/depth/presentation";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { relativeTime } from "@/lib/time/relative";

interface NearbyReport {
  id: string;
  depth: DepthLevel;
  reported_at: string;
  photo_path: string | null;
  lat: number;
  lon: number;
  distance_m: number;
}

interface StreetHistoryProps {
  point: { lat: number; lon: number } | null;
  onSelect: (report: MapReport) => void;
}

const STREET_RADIUS_M = 150;

function toMapReport(row: NearbyReport): MapReport {
  return {
    id: row.id,
    depth: row.depth,
    lat: row.lat,
    lon: row.lon,
    photoPath: row.photo_path,
    reportedAt: row.reported_at,
  };
}

export function StreetHistory({ point, onSelect }: StreetHistoryProps) {
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

      {/* The worst case leads. Someone reading this is deciding whether to walk
          down the street, and the average depth is not what would stop them. */}
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
        {reports.map((report) => {
          const thumb = reportPhotoUrl(report.photo_path);
          return (
            <li key={report.id}>
              <button
                type="button"
                className="report-row"
                onClick={() => onSelect(toMapReport(report))}
              >
                <span
                  className="report-swatch"
                  style={{ background: DEPTH_VAR[report.depth] }}
                />
                <span className="report-label">{depthLabel(report.depth).tl}</span>
                <span className="report-when">{relativeTime(report.reported_at)}</span>
                {thumb ? (
                  <img className="report-thumb" src={thumb} alt="" aria-hidden="true" />
                ) : (
                  <span className="report-thumb report-thumb--empty" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
