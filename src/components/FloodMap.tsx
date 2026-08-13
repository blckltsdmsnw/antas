"use client";

import { useEffect, useRef } from "react";
import { MapLibreMap, Marker, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { depthRank, type DepthLevel } from "@/lib/depth/scale";

export interface MapReport {
  id: string;
  lat: number;
  lon: number;
  depth: DepthLevel;
}

/** Shallow to deep. Index matches depthRank(). */
const DEPTH_COLORS = ["#7dd3fc", "#38bdf8", "#0284c7", "#1e40af", "#581c87"];

/** Deepest colour in the scale — used as a fallback when a depth value
 * falls outside the known scale, so a bad row still renders a marker
 * (in the worst-case colour) instead of an undefined one. */
const FALLBACK_COLOR = DEPTH_COLORS[DEPTH_COLORS.length - 1];

function colorForDepth(depth: DepthLevel): string {
  return DEPTH_COLORS[depthRank(depth)] ?? FALLBACK_COLOR;
}

/**
 * CARTO Positron: a real street basemap, free and keyless, deliberately muted so
 * the depth markers stay readable on top of it.
 *
 * NOT maplibre's demotiles style — that contains only country outlines at world
 * zoom, so at street zoom over Marikina it renders an empty blue rectangle with
 * markers floating in a void. This app's whole premise is "has THIS street
 * flooded", which needs streets.
 */
const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

interface FloodMapProps {
  reports: MapReport[];
  onPick: (lat: number, lon: number) => void;
}

export function FloodMap({ reports, onPick }: FloodMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;

    map.current = new MapLibreMap({
      container: container.current,
      style: BASEMAP_STYLE,
      center: [121.1, 14.65],
      zoom: 13,
    });

    map.current.on("click", (e: MapMouseEvent) => onPick(e.lngLat.lat, e.lngLat.lng));
  }, [onPick]);

  useEffect(() => {
    if (!map.current) return;

    const markers = reports.map((report) =>
      new Marker({ color: colorForDepth(report.depth) })
        .setLngLat([report.lon, report.lat])
        .addTo(map.current!),
    );

    return () => markers.forEach((marker) => marker.remove());
  }, [reports]);

  return <div ref={container} style={{ height: "70vh", width: "100%" }} />;
}
