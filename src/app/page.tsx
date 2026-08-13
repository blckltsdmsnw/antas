"use client";

import { useEffect, useState } from "react";
import { FloodMap, type MapReport } from "@/components/FloodMap";
import { StreetHistory } from "@/components/StreetHistory";
import { MapLegend } from "@/components/MapLegend";
import { createClient } from "@/lib/supabase/client";
import type { DepthLevel } from "@/lib/depth/scale";

/** Wide enough to cover the whole pilot area from its centre. */
const CITY_CENTRE = { lat: 14.65, lon: 121.1 };
const CITY_RADIUS_M = 10_000;

interface NearbyRow {
  id: string;
  depth: DepthLevel;
  lat: number;
  lon: number;
}

export default function HomePage() {
  const [reports, setReports] = useState<MapReport[]>([]);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);

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
          })),
        );
      });
  }, []);

  return (
    <main className="map-shell">
      <h1 className="sr-only">Antas</h1>
      <div className="map-canvas">
        <FloodMap
          reports={reports}
          onPick={(lat, lon) => setPoint({ lat, lon })}
        />
      </div>
      <MapLegend />
      <StreetHistory point={point} />
    </main>
  );
}
