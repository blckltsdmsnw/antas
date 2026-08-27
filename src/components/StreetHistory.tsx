"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MapReport } from "@/components/FloodMap";
import { depthRank, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_VAR, SEVERITY_VAR } from "@/lib/depth/presentation";
import { depthName } from "@/lib/depth/name";
import type { HazardType, Severity } from "@/lib/hazard/types";
import { hazardName, severityWord } from "@/lib/hazard/name";
import { HazardIcon } from "@/components/HazardIcon";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { relativeTime } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

interface NearbyReport {
  id: string;
  hazard_type: HazardType;
  severity: Severity;
  depth: DepthLevel | null;
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
    hazard: row.hazard_type,
    severity: row.severity,
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

  // "Pinakamalalim" (deepest) is a claim about water, and only makes sense
  // while every report on this street is flood. The moment one is not, the
  // worst case is read off the shared severity scale instead - see
  // `cluster.ts`'s `deepestOf`, which refuses the same shortcut.
  const allFlood = reports.every((report) => report.hazard_type === "flood");

  const worst = allFlood
    ? reports.reduce((deepest, report) =>
        report.depth !== null &&
        (deepest.depth === null || depthRank(report.depth) > depthRank(deepest.depth))
          ? report
          : deepest,
      )
    : reports.reduce((worst, report) => (report.severity > worst.severity ? report : worst));

  const worstColor =
    worst.depth !== null ? DEPTH_VAR[worst.depth] : SEVERITY_VAR[worst.severity];

  return (
    <section className="history-sheet">
      <h2 className="sheet-count">{copy.screens.historyCount(reports.length)}</h2>

      {/* The worst case leads. Someone reading this is deciding whether to walk
          down the street, and the average depth is not what would stop them.
          Branches on `worst.depth`, not `allFlood`: `worst` is a single real
          report, and depth is only ever non-null for a flood report, so this
          is the same one-member consistency `cluster.ts` enforces - a worst
          report picked by severity from a mixed street must never be read
          through `severityWord` when it turns out to be the flood one. */}
      <p className="deepest">
        <span className="deepest-dot" style={{ background: worstColor }} />
        {worst.depth === null && <HazardIcon hazard={worst.hazard_type} size="sm" />}
        <span className="deepest-label">
          {worst.depth !== null ? (
            copy.screens.historyDeepest(depthName(worst.depth, copy.map))
          ) : (
            <>
              {hazardName(worst.hazard_type, copy.hazard)} ·{" "}
              {severityWord(worst.hazard_type, worst.severity, copy.hazard)}
            </>
          )}
        </span>
      </p>

      <ul className="report-list">
        {reports.map((report) => {
          const thumb = reportPhotoUrl(report.photo_path);
          const rowColor =
            report.depth !== null ? DEPTH_VAR[report.depth] : SEVERITY_VAR[report.severity];
          const rowLabel =
            report.depth !== null
              ? depthName(report.depth, copy.map)
              : hazardName(report.hazard_type, copy.hazard);
          return (
            <li key={report.id}>
              <button
                type="button"
                className="report-row"
                onClick={() => onSelect(toMapReport(report))}
              >
                <span className="report-swatch" style={{ background: rowColor }} />
                {/* The word follows right after, so the icon carries no title -
                    see `HazardIcon`. */}
                {report.depth === null && (
                  <HazardIcon hazard={report.hazard_type} size="sm" />
                )}
                <span className="report-label">{rowLabel}</span>
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
