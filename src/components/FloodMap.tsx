"use client";

import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  MapLibreMap,
  Marker,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_HEX } from "@/lib/depth/presentation";
import { clusterByProximity, CLUSTER_RADIUS_PX } from "@/lib/map/cluster";
import { mapThemeFor, type MapTheme } from "@/lib/map/theme";
import { freshnessOf, freshnessOpacity } from "@/lib/reports/freshness";
import { reportPhotoUrl } from "@/lib/reports/photo";

export interface MapReport {
  id: string;
  lat: number;
  lon: number;
  depth: DepthLevel;
  photoPath: string | null;
  reportedAt: string;
}

/** Deepest colour in the scale - used as a fallback when a depth value falls
 * outside the known scale, so a bad row still renders a marker (in the
 * worst-case colour) rather than an undefined one. */
const FALLBACK_COLOR = DEPTH_HEX.above_head;

function colorForDepth(depth: DepthLevel): string {
  return DEPTH_HEX[depth] ?? FALLBACK_COLOR;
}

/**
 * CARTO Positron basemap — free, keyless, and deliberately muted so the depth
 * markers stay readable on top of it.
 *
 * Two deliberate choices here, both learned the hard way:
 *
 * 1. NOT maplibre's demotiles style. That contains only country outlines at
 *    world zoom, so at street zoom over Marikina it draws an empty rectangle
 *    with markers floating in a void. This app's premise is "has THIS street
 *    flooded", which requires streets.
 *
 * 2. RASTER tiles, not the vector style. The vector style loaded, applied its
 *    attribution, and then never requested a single tile — vector tiles are
 *    decoded in a web worker, and the background, sprite and markers all render
 *    without one, so the failure presented as a blank map rather than an error.
 *    Raster tiles decode on the main thread and avoid the worker entirely.
 */
function cartoTiles(variant: "light_all" | "dark_all"): string[] {
  return ["a", "b", "c"].map(
    (host) => `https://${host}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
  );
}

const TILES: Record<MapTheme, string[]> = {
  light: cartoTiles("light_all"),
  dark: cartoTiles("dark_all"),
};

/**
 * Lifts the night basemap out of near-black.
 *
 * CARTO's dark tiles are drawn for decorative dashboards, where a near-black
 * ground with faint grey streets looks good. On a phone at arm's length it
 * means the street you are trying to find is barely there. Raising the black
 * point turns it into a charcoal with legible roads, and dropping the contrast
 * slightly keeps the labels from glaring.
 *
 * Applied to the raster layer rather than as a CSS filter on the canvas so the
 * markers, which are DOM overlays, keep their full colour.
 */
interface RasterPaint {
  "raster-brightness-min": number;
  "raster-contrast": number;
}

const RASTER_PAINT: Record<MapTheme, RasterPaint> = {
  light: { "raster-brightness-min": 0, "raster-contrast": 0 },
  dark: { "raster-brightness-min": 0.22, "raster-contrast": -0.08 },
};

/**
 * Read on demand rather than held in state so the map can be *built* with the
 * right tiles. Deciding after mount meant the first paint was always light and
 * then swapped, which at night is a white flash in a dark room.
 */
function currentTheme(): MapTheme {
  return mapThemeFor(new Date());
}

const BASEMAP_ATTRIBUTION =
  '© <a href="https://carto.com/attributions">CARTO</a>, ' +
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface FloodMapProps {
  reports: MapReport[];
  onPick: (lat: number, lon: number) => void;
  onSelect: (report: MapReport) => void;
  selectedId: string | null;
  /**
   * Reported upward so the page can mark the shell, which is what the floating
   * panels are children of. They are siblings of the canvas, so an attribute on
   * the map element itself is unreachable from their selectors.
   */
  onTheme?: (theme: MapTheme) => void;
  /**
   * Fired once the basemap has actually painted. The splash waits on this
   * rather than on a timer, so it covers real latency instead of inventing it.
   */
  onReady?: () => void;
  /**
   * Where search wants the camera. Carries an `at` stamp so choosing the same
   * place twice still flies there - without it, picking Malanday, panning away
   * and picking Malanday again would change no prop and do nothing.
   */
  focus?: { lat: number; lon: number; at: number } | null;
  /**
   * Where the user is, once they have asked. Rendered as its own marker so the
   * locate button answers "where am I" rather than only "go there" - a camera
   * move with nothing marked leaves you guessing which street was yours.
   */
  self?: { lat: number; lon: number } | null;
}

/**
 * Close enough to read street names, wide enough to show a whole barangay.
 *
 * The centroids behind search are approximate, so flying to maximum zoom would
 * claim a precision the data does not have - it would put someone confidently
 * on the wrong street corner.
 */
const FOCUS_ZOOM = 14.5;

/**
 * A pin, as a real button rather than MapLibre's default teardrop.
 *
 * Three things the default cannot express: which reports carry a photo, which
 * one is open, and how old the report is. A photo pin now shows the photograph
 * itself - the previous ring gap was too subtle to decode, so nobody discovered
 * which pins were worth tapping.
 */
function singlePinElement(
  report: MapReport,
  isSelected: boolean,
): HTMLButtonElement {
  const photo = reportPhotoUrl(report.photoPath);
  const el = document.createElement("button");
  el.type = "button";
  el.className = `pin${photo ? " pin--photo" : ""}${isSelected ? " pin--selected" : ""}`;
  el.style.setProperty("--pin-color", colorForDepth(report.depth));

  // Age as opacity. Secondary only: the detail card states it in words, which
  // is what someone who cannot perceive the fade relies on.
  el.style.opacity = String(freshnessOpacity(freshnessOf(report.reportedAt)));

  if (photo) {
    const img = document.createElement("img");
    img.src = photo;
    img.alt = "";
    img.className = "pin-thumb";
    // A broken thumbnail degrades to an ordinary coloured pin rather than to a
    // torn-image icon sitting on the map.
    img.addEventListener("error", () => {
      el.classList.remove("pin--photo");
      img.remove();
    });
    el.appendChild(img);
  }

  el.setAttribute(
    "aria-label",
    `${depthLabel(report.depth).tl}${photo ? ", may larawan" : ""}`,
  );
  return el;
}

/**
 * A group of pins too close together to tap apart.
 *
 * Takes the colour of its deepest member, never an average - see
 * `clusterByProximity`. The count is rendered as text so the information does
 * not live in size alone.
 */
function clusterElement(depth: DepthLevel, count: number): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pin-cluster";
  el.style.setProperty("--pin-color", colorForDepth(depth));
  el.textContent = String(count);
  el.setAttribute(
    "aria-label",
    `${count} report dito, pinakamalalim: ${depthLabel(depth).tl}. Pindutin para lakihan.`,
  );
  return el;
}

export function FloodMap({
  reports,
  onPick,
  onSelect,
  selectedId,
  onTheme,
  onReady,
  focus,
  self,
}: FloodMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  // Seeded from the clock for the same reason the map is *built* with
  // currentTheme(): starting light and correcting on the first effect is a
  // visible flash at night.
  const [theme, setTheme] = useState<MapTheme>(currentTheme);

  /**
   * Follows the clock, and re-checks periodically so a map left open through
   * dusk changes with it rather than staying bright until the tab is reloaded.
   *
   * No longer watches `prefers-color-scheme`: the device setting is not
   * evidence about the light the user is standing in, and letting it win made
   * the map dark at lunchtime. See `mapThemeFor`. Dropping the media query also
   * removes a `window.matchMedia` call that old webviews do not always provide.
   */
  useEffect(() => {
    const decide = () => setTheme(currentTheme());

    decide();
    const timer = window.setInterval(decide, 5 * 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!container.current || map.current) return;

    map.current = new MapLibreMap({
      container: container.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            // Decided here, not read from state: state has not settled on the
            // first commit, and building light-then-swapping is a white flash.
            tiles: TILES[currentTheme()],
            tileSize: 256,
            attribution: BASEMAP_ATTRIBUTION,
          },
        },
        layers: [
          {
            id: "basemap",
            type: "raster",
            source: "basemap",
            paint: RASTER_PAINT[currentTheme()],
          },
        ],
      },
      // Metro Manila, not Marikina. Opening at street zoom over one city meant
      // anyone elsewhere in the region opened the app looking at somebody
      // else's neighbourhood, with their own reports off-screen.
      center: [121.02, 14.58],
      zoom: 10.5,
    });

    // MapLibre reports style, tile and glyph failures through this event. Without
    // a listener they vanish silently and the map just renders blank, which is
    // indistinguishable from "there is no data here".
    // TODO: replace with real telemetry once a logger exists.
    map.current.on("error", (e) => {
      console.error("maplibre error", {
        message: e.error?.message,
        source: (e as { sourceId?: string }).sourceId,
      });
    });

    map.current.on("load", () => onReady?.());

    map.current.on("click", (e: MapMouseEvent) => onPick(e.lngLat.lat, e.lngLat.lng));
  }, [onPick, onReady]);

  // Swap the basemap in place rather than rebuilding the style: setStyle would
  // drop every marker and reset the camera, so the map would visibly flash and
  // jump back to Metro Manila at dusk.
  useEffect(() => {
    const instance = map.current;
    const source = instance?.getSource("basemap");
    if (source && "setTiles" in source) {
      (source as { setTiles: (tiles: string[]) => void }).setTiles(TILES[theme]);
    }
    if (instance?.getLayer("basemap")) {
      const paint = RASTER_PAINT[theme];
      instance.setPaintProperty(
        "basemap",
        "raster-brightness-min",
        paint["raster-brightness-min"],
      );
      instance.setPaintProperty("basemap", "raster-contrast", paint["raster-contrast"]);
    }
    onTheme?.(theme);
  }, [theme, onTheme]);

  // Fly, rather than jump. A cut leaves no sense of where the new view sits
  // relative to the old one, and the whole point of searching your barangay is
  // to know where you have arrived.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !focus) return;

    instance.flyTo({
      center: [focus.lon, focus.lat],
      zoom: Math.max(instance.getZoom(), FOCUS_ZOOM),
      duration: 900,
      essential: true,
    });
  }, [focus]);

  /**
   * Kept out of the clustering effect below on purpose. That one wipes and
   * rebuilds its whole marker set on every `moveend`, and this dot is not a
   * report - it should not blink out and back on every pan, and it must never
   * be swept into a cluster count.
   */
  useEffect(() => {
    const instance = map.current;
    if (!instance || !self) return;

    const element = document.createElement("div");
    element.className = "self-dot";
    element.setAttribute("aria-hidden", "true");

    const marker = new Marker({ element })
      .setLngLat([self.lon, self.lat])
      .addTo(instance);

    return () => {
      marker.remove();
    };
  }, [self]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    let markers: Marker[] = [];

    /**
     * Clusters in screen space, so grouping follows the zoom.
     *
     * Whether two pins collide is a question about pixels, not about metres:
     * reports 200m apart are inseparable at city zoom and comfortably distinct
     * at street zoom. That means this has to run again whenever the view
     * changes - on `moveend` rather than `move`, so a pan is not recomputing
     * hundreds of DOM nodes every frame.
     */
    function draw() {
      markers.forEach((marker) => marker.remove());

      const projected = reports.map((report) => {
        const point = instance!.project([report.lon, report.lat]);
        return { id: report.id, x: point.x, y: point.y, depth: report.depth, report };
      });

      markers = clusterByProximity(projected, CLUSTER_RADIUS_PX).map((cluster) => {
        const single = cluster.members.length === 1 ? cluster.members[0].report : null;

        const element = single
          ? singlePinElement(single, single.id === selectedId)
          : clusterElement(cluster.depth, cluster.members.length);

        // Without stopPropagation the map's own click handler also fires, so a
        // tap would open the report and then immediately replace it with the
        // street list for the point underneath.
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          if (single) {
            onSelect(single);
            return;
          }
          // Zoom to fit the members, not by a fixed step.
          //
          // A flat "+2 zoom" is a nudge: for a tight group two levels is not
          // enough to separate them, so the cluster re-forms at the new zoom
          // and the tap appears to have done nothing. Fitting the members'
          // own bounds breaks the group apart in one tap, whatever its spread.
          const bounds = cluster.members.reduce(
            (box, member) => box.extend([member.report.lon, member.report.lat]),
            new LngLatBounds(
              [cluster.members[0].report.lon, cluster.members[0].report.lat],
              [cluster.members[0].report.lon, cluster.members[0].report.lat],
            ),
          );

          const fit = {
            // Enough margin that the outermost pins are not against the edge,
            // and clear of the sheet at the bottom.
            padding: { top: 80, bottom: 220, left: 60, right: 60 },
            // Members can sit almost on top of each other, in which case the
            // bounds collapse to a point and fitBounds would go to maximum
            // zoom. Street level is as far as this ever needs to go.
            maxZoom: 17.5,
          };

          // Some clusters cannot be separated by zooming at all: two reports a
          // few metres apart stay within one touch target even at maximum zoom.
          // Zooming there produces a tap that visibly does nothing, which is
          // what made the whole interaction feel broken. Where zooming will not
          // help, open the list for that spot instead - every member is in it,
          // with a thumbnail, and each row opens its own report.
          const target = instance!.cameraForBounds(bounds, fit);
          const worthZooming =
            target !== undefined && target.zoom !== undefined
              ? target.zoom > instance!.getZoom() + 0.2
              : false;

          if (worthZooming) {
            instance!.fitBounds(bounds, { ...fit, duration: 450 });
          } else {
            const centre = instance!.unproject([cluster.x, cluster.y]);
            onPick(centre.lat, centre.lng);
          }
        });

        return new Marker({ element })
          .setLngLat(instance!.unproject([cluster.x, cluster.y]))
          .addTo(instance!);
      });
    }

    draw();
    instance.on("moveend", draw);

    return () => {
      instance.off("moveend", draw);
      markers.forEach((marker) => marker.remove());
    };
  }, [reports, onSelect, onPick, selectedId]);

  // Fills whatever the parent gives it — the map page makes that the full
  // viewport below the header, so the map is the product rather than a panel.
  return <div ref={container} style={{ height: "100%", width: "100%" }} />;
}
