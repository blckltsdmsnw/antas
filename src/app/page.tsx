"use client";

import { useCallback, useEffect, useState } from "react";
import { FloodMap, type MapReport } from "@/components/FloodMap";
import { StreetHistory } from "@/components/StreetHistory";
import { ReportDetail } from "@/components/ReportDetail";
import { MapLegend } from "@/components/MapLegend";
import { WeatherStrip } from "@/components/WeatherStrip";
import { createClient } from "@/lib/supabase/client";
import type { DepthLevel } from "@/lib/depth/scale";

/**
 * Wide enough to cover the whole pilot area from its centre.
 *
 * Both values are Metro Manila's, not Marikina's. When the pilot area widened
 * these did not - so a report from Taguig sat 28km outside the fetch radius and
 * was never requested at all. The map looked empty while the data was fine,
 * which is the worst kind of wrong: nothing to debug, because nothing failed.
 *
 * NCR runs roughly 45km north to south, so 40km from a central point reaches
 * every corner of it.
 */
const CITY_CENTRE = { lat: 14.58, lon: 121.02 };
const CITY_RADIUS_M = 40_000;

interface NearbyRow {
  id: string;
  depth: DepthLevel;
  lat: number;
  lon: number;
  photo_path: string | null;
  reported_at: string;
}

export default function HomePage() {
  const [reports, setReports] = useState<MapReport[]>([]);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [selected, setSelected] = useState<MapReport | null>(null);

  useEffect(() => {
    createClient()
      .rpc("reports_near", {
        lat: CITY_CENTRE.lat,
        lon: CITY_CENTRE.lon,
        radius_m: CITY_RADIUS_M,
      })
      .then(({ data }) => {
        const rows = (data ?? []) as NearbyRow[];
        setReports(
          rows.map((row) => ({
            id: row.id,
            depth: row.depth,
            lat: row.lat,
            lon: row.lon,
            photoPath: row.photo_path,
            reportedAt: row.reported_at,
          })),
        );
      });
  }, []);

  // Tapping a pin and tapping the street it sits on are different questions -
  // "what does this report say" versus "what has happened here" - so opening
  // one closes the other rather than stacking two sheets.
  const openReport = useCallback((report: MapReport) => {
    setPoint(null);
    setSelected(report);
  }, []);

  const openStreet = useCallback((lat: number, lon: number) => {
    setSelected(null);
    setPoint({ lat, lon });
  }, []);

  return (
    <main className="map-shell">
      <h1 className="sr-only">Antas</h1>
      <div className="map-canvas">
        <FloodMap
          reports={reports}
          onPick={openStreet}
          onSelect={openReport}
          selectedId={selected?.id ?? null}
        />
      </div>
      <WeatherStrip />
      <MapLegend />
      {selected ? (
        <ReportDetail report={selected} onClose={() => setSelected(null)} />
      ) : (
        <StreetHistory point={point} onSelect={openReport} />
      )}
    </main>
  );
}
