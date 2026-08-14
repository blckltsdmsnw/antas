"use client";

import { useCallback, useEffect, useState } from "react";
import { FloodMap, type MapReport } from "@/components/FloodMap";
import { StreetHistory } from "@/components/StreetHistory";
import { ReportDetail } from "@/components/ReportDetail";
import { MapLegend } from "@/components/MapLegend";
import { WeatherStrip } from "@/components/WeatherStrip";
import { RainOverlay } from "@/components/RainOverlay";
import { SplashScreen } from "@/components/SplashScreen";
import { mapThemeFor, type MapTheme } from "@/lib/map/theme";
import type { CurrentWeather } from "@/lib/env/current-weather";
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

/** The header's two backgrounds, mirrored into the status bar. Literals rather
 *  than custom properties because `meta[content]` cannot resolve `var()`. */
const PAPER = "#ffffff";
const PANEL = "#253044";

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
  // Seeded from the clock rather than hardcoded to "light". Starting light and
  // correcting after mount stamped data-map-theme="light" for a frame, which is
  // the white flash in a dark room that the basemap already goes out of its way
  // to avoid - and it made an e2e assertion pass against the transient value
  // instead of the settled one.
  const [mapTheme, setMapTheme] = useState<MapTheme>(() => mapThemeFor(new Date()));
  const [weather, setWeather] = useState<CurrentWeather | null>(null);

  // Two signals, because either alone lies. The basemap can paint before a
  // single pin exists, and the reports can arrive before there is a map to put
  // them on - clearing the splash on one of them shows a half-built map.
  const [mapReady, setMapReady] = useState(false);
  const [reportsReady, setReportsReady] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("reports_near", {
        lat: CITY_CENTRE.lat,
        lon: CITY_CENTRE.lon,
        radius_m: CITY_RADIUS_M,
      })
      .then(({ data }) => {
        setReportsReady(true);
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

  /**
   * Stamped on the document root, not on the shell, because the header is
   * rendered by the layout and sits outside this component's tree - and a
   * white band above a night map is worse than either theme on its own.
   *
   * Cleared on unmount so navigating to /report does not leave a form dark.
   */
  useEffect(() => {
    document.documentElement.dataset.mapTheme = mapTheme;

    // The status bar too, or an installed app shows a white band above a night
    // map - the same mismatch the attribute above exists to prevent, one strip
    // further out. It cannot be declared statically in `viewport`: the theme
    // follows the Manila clock, and a static value cannot track a clock.
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", mapTheme === "dark" ? PANEL : PAPER);

    return () => {
      delete document.documentElement.dataset.mapTheme;
      meta?.setAttribute("content", PAPER);
    };
  }, [mapTheme]);

  // Tapping a pin and tapping the street it sits on are different questions -
  // "what does this report say" versus "what has happened here" - so opening
  // one closes the other rather than stacking two sheets.
  const openReport = useCallback((report: MapReport) => {
    setPoint(null);
    setSelected(report);
  }, []);

  // Stable: it sits in the dependency list of the effect that builds the map,
  // and a fresh identity every render would churn that effect needlessly.
  const markMapReady = useCallback(() => setMapReady(true), []);

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
          onTheme={setMapTheme}
          onReady={markMapReady}
        />
      </div>
      <SplashScreen ready={mapReady && reportsReady} />
      <RainOverlay weather={weather} />
      <WeatherStrip onWeather={setWeather} />
      <MapLegend />
      {selected ? (
        <ReportDetail report={selected} onClose={() => setSelected(null)} />
      ) : (
        <StreetHistory point={point} onSelect={openReport} />
      )}
    </main>
  );
}
