"use client";

import { useEffect, useRef } from "react";
import { MapLibreMap, Marker, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_HEX } from "@/lib/depth/presentation";

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
 * Two things the default cannot express: which reports carry a photo, and which
 * one is currently open. Both matter now that tapping a pin is how you see the
 * water - without the camera mark, finding a report with a picture means
 * tapping pins at random.
 */
function pinElement(report: MapReport, isSelected: boolean): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `pin${report.photoPath ? " pin--photo" : ""}${
    isSelected ? " pin--selected" : ""
  }`;
  el.style.setProperty("--pin-color", colorForDepth(report.depth));
  el.setAttribute(
    "aria-label",
    `${depthLabel(report.depth).tl}${report.photoPath ? ", may larawan" : ""}`,
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
    if (!map.current) return;

    const markers = reports.map((report) => {
      const element = pinElement(report, report.id === selectedId);

      // Without stopPropagation the map's own click handler also fires, so
      // tapping a pin would open that report and then immediately replace it
      // with the street list for the point underneath.
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelect(report);
      });

      return new Marker({ element })
        .setLngLat([report.lon, report.lat])
        .addTo(map.current!);
    });

    return () => markers.forEach((marker) => marker.remove());
  }, [reports, onSelect, selectedId]);

  // Fills whatever the parent gives it — the map page makes that the full
  // viewport below the header, so the map is the product rather than a panel.
  return <div ref={container} style={{ height: "100%", width: "100%" }} />;
}
