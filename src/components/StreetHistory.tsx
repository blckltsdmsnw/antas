"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MapReport } from "@/components/FloodMap";
import { depthRank, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_VAR } from "@/lib/depth/presentation";
import { depthName } from "@/lib/depth/name";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { relativeTime } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

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
  const copy = useCopy();
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
        <p className="sheet-hint">{copy.screens.historyHint}</p>
      </section>
    );
  }

  if (reports === null) {
    return (
      <section className="history-sheet">
        <p className="sheet-hint">{copy.screens.historySearching}</p>
      </section>
    );
  }

  if (reports.length === 0) {
    return (
      <section className="history-sheet">
        <p className="sheet-hint">{copy.screens.historyEmpty}</p>
      </section>
    );
  }

  const deepest = reports.reduce((worst, report) =>
    depthRank(report.depth) > depthRank(worst.depth) ? report : worst,
  );

  return (
    <section className="history-sheet">
      <h2 className="sheet-count">{copy.screens.historyCount(reports.length)}</h2>

      {/* The worst case leads. Someone reading this is deciding whether to walk
          down the street, and the average depth is not what would stop them. */}
      <p className="deepest">
        <span
          className="deepest-dot"
          style={{ background: DEPTH_VAR[deepest.depth] }}
        />
        <span className="deepest-label">
          {copy.screens.historyDeepest(depthName(deepest.depth, copy.map))}
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
                <span className="report-label">
                  {depthName(report.depth, copy.map)}
                </span>
                <span className="report-when">
                  {relativeTime(report.reported_at, copy.screens)}
                </span>
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
