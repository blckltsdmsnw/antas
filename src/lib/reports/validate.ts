import { isDepthLevel, type DepthLevel } from "@/lib/depth/scale";

export const MARIKINA_BOUNDS = {
  minLat: 14.6,
  maxLat: 14.72,
  minLon: 121.05,
  maxLon: 121.15,
} as const;

/** GPS readings worse than this are accepted but flagged. */
export const LOW_GPS_ACCURACY_M = 100;

export interface ReportInput {
  depth: string;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
}

export type ValidationResult =
  | { ok: true; depth: DepthLevel; warnings: string[] }
  | { ok: false; errors: string[] };

export function validateReport(input: ReportInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isDepthLevel(input.depth)) {
    errors.push("invalid_depth");
  }

  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon)) {
    errors.push("invalid_coordinates");
  } else if (
    input.lat < MARIKINA_BOUNDS.minLat ||
    input.lat > MARIKINA_BOUNDS.maxLat ||
    input.lon < MARIKINA_BOUNDS.minLon ||
    input.lon > MARIKINA_BOUNDS.maxLon
  ) {
    errors.push("outside_pilot_area");
  }

  if (input.gpsAccuracyM !== null && input.gpsAccuracyM > LOW_GPS_ACCURACY_M) {
    warnings.push("low_gps_accuracy");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, depth: input.depth as DepthLevel, warnings };
}
