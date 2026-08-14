"use client";

import { useCallback, useEffect, useState } from "react";
import { FloodMap, type MapReport } from "@/components/FloodMap";
import { StreetHistory } from "@/components/StreetHistory";
import { ReportDetail } from "@/components/ReportDetail";
import { MapLegend } from "@/components/MapLegend";
import { WeatherStrip } from "@/components/WeatherStrip";
import { RainOverlay } from "@/components/RainOverlay";
import { SplashScreen } from "@/components/SplashScreen";
import { PlaceSearch, type Place } from "@/components/PlaceSearch";
import { LocateButton } from "@/components/LocateButton";
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
  const [focus, setFocus] = useState<{ lat: number; lon: number; at: number } | null>(null);
  const [self, setSelf] = useState<{ lat: number; lon: number } | null>(null);

  // Two signals, because either alone lies. The basemap can paint before a
  // single pin exists, and the reports can arrive before there is a map to put
  // them on - clearing the splash on one of them shows a half-built map.
  const [mapReady, setMapReady] = useState(false);
  const [reportsReady, setReportsReady] = useState(false);

  /**
   * A map that failed to load and a map with nothing on it look identical, and
   * on a flood map the second one reads as "no flooding reported here". That is
   * the most dangerous thing this application can say, so the failure is held
   * in its own state and shown, rather than collapsing into an empty array.
   *
   * `attempt` is the retry trigger: bumping it re-runs this effect.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;

    createClient()
      .rpc("reports_near", {
        lat: CITY_CENTRE.lat,
        lon: CITY_CENTRE.lon,
        radius_m: CITY_RADIUS_M,
      })
      .then(
        ({ data, error }) => {
          if (!current) return;
          setReportsReady(true);

          // supabase-js resolves with an `error` rather than rejecting, so a
          // failure here arrives down the success path. Reading only `data`
          // turned every outage into a convincingly empty map.
          if (error) {
            setLoadFailed(true);
            return;
          }

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
        },
        // And a genuine rejection - offline, DNS, a dead fetch - never reaches
        // the handler above at all.
        () => {
          if (!current) return;
          setReportsReady(true);
          setLoadFailed(true);
        },
      );

    return () => {
      current = false;
    };
  }, [attempt]);

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

  // Choosing a place closes whatever sheet was open: the answer you asked for
  // is on the map behind it, and leaving a sheet up hides the thing you
  // travelled to see.
  const goToPlace = useCallback((place: Place) => {
    setSelected(null);
    setPoint(null);
    setFocus({ lat: place.lat, lon: place.lon, at: Date.now() });
  }, []);

  // Both, from one tap: fly there, and mark it. Flying alone answers "go here"
  // and leaves you working out which of these streets was yours.
  const goToSelf = useCallback((position: { lat: number; lon: number }) => {
    setSelected(null);
    setPoint(null);
    setSelf(position);
    setFocus({ ...position, at: Date.now() });
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
          focus={focus}
          self={self}
        />
      </div>
      <SplashScreen ready={mapReady && reportsReady} />
      <PlaceSearch onPick={goToPlace} />
      <LocateButton onLocate={goToSelf} />

      {/* Stated, never implied. An empty map is a claim about the world. */}
      {loadFailed && (
        <div className="map-error" role="alert">
          <p className="map-error-text">
            <strong>Hindi ma-load ang mga report.</strong> Hindi ibig sabihin nito
            na walang baha - hindi lang namin makuha ang datos ngayon.
          </p>
          <button
            type="button"
            className="map-error-retry"
            // Cleared here rather than at the top of the effect: resetting it
            // there is a synchronous setState in an effect body, and the retry
            // is the moment the previous failure actually stops being true.
            onClick={() => {
              setLoadFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Subukan ulit
          </button>
        </div>
      )}
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
