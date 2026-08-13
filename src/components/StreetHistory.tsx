"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { depthLabel, depthRank, type DepthLevel } from "@/lib/depth/scale";

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

  if (!point) return <p>Pindutin ang mapa para makita ang kasaysayan.</p>;
  if (reports === null) return <p>Naghahanap...</p>;
  if (reports.length === 0) {
    return <p>Walang naitalang baha sa lugar na ito.</p>;
  }

  const deepest = reports.reduce((worst, report) =>
    depthRank(report.depth) > depthRank(worst.depth) ? report : worst,
  );

  return (
    <section>
      <h2>{reports.length} report sa lugar na ito</h2>
      <p>Pinakamalalim: {depthLabel(deepest.depth).tl}</p>
      <ul>
        {reports.map((report) => (
          <li key={report.id}>
            {depthLabel(report.depth).tl} —{" "}
            {new Date(report.reported_at).toLocaleDateString("en-PH")}
          </li>
        ))}
      </ul>
    </section>
  );
}
