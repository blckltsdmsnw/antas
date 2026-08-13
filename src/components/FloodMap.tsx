"use client";

import { useEffect, useRef } from "react";
import { MapLibreMap, Marker, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_HEX } from "@/lib/depth/presentation";
import { clusterByProximity, CLUSTER_RADIUS_PX } from "@/lib/map/cluster";
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
const CARTO_RASTER_TILES = [
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
];

const BASEMAP_ATTRIBUTION =
  '© <a href="https://carto.com/attributions">CARTO</a>, ' +
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface FloodMapProps {
  reports: MapReport[];
  onPick: (lat: number, lon: number) => void;
  onSelect: (report: MapReport) => void;
  selectedId: string | null;
}

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
}: FloodMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;

    map.current = new MapLibreMap({
      container: container.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: CARTO_RASTER_TILES,
            tileSize: 256,
            attribution: BASEMAP_ATTRIBUTION,
          },
        },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
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

    map.current.on("click", (e: MapMouseEvent) => onPick(e.lngLat.lat, e.lngLat.lng));
  }, [onPick]);

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
          // Zooming in is the only honest response to "there are 12 reports
          // here" - picking one of them for the user would be a guess.
          instance!.easeTo({
            center: instance!.unproject([cluster.x, cluster.y]),
            zoom: Math.min(instance!.getZoom() + 2, 17),
            duration: 400,
          });
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
  }, [reports, onSelect, selectedId]);

  // Fills whatever the parent gives it — the map page makes that the full
  // viewport below the header, so the map is the product rather than a panel.
  return <div ref={container} style={{ height: "100%", width: "100%" }} />;
}
