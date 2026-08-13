import { isDepthLevel, type DepthLevel } from "@/lib/depth/scale";

/**
 * Metro Manila (the National Capital Region), as a bounding box.
 *
 * Deliberately a rectangle rather than the region's real outline: it is simple,
 * cheap to check, and errs toward accepting a report from just outside the
 * boundary rather than refusing one from just inside it. For a flood-reporting
 * app that is the right direction to be wrong in - a refused report is lost
 * information, an over-accepted one is merely slightly out of area.
 */
export const PILOT_BOUNDS = Object.freeze({
  minLat: 14.34,
  maxLat: 14.8,
  minLon: 120.9,
  maxLon: 121.15,
} as const);


/** GPS readings worse than this are accepted but flagged. */
export const LOW_GPS_ACCURACY_M = 100;

export interface ReportInput {
  depth: string;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
  /**
   * Carried, not validated. The storage policy already restricts a user to
   * their own folder, and whether the photo is any good is a human judgement
   * this module has no way to make.
   */
  photoPath?: string | null;
}

export type ReportErrorCode =
  | "invalid_depth"
  | "invalid_coordinates"
  | "outside_pilot_area";

export type ReportWarningCode = "low_gps_accuracy";

export type ValidationResult =
  | { ok: true; depth: DepthLevel; warnings: ReportWarningCode[] }
  | { ok: false; errors: ReportErrorCode[] };

export function validateReport(input: ReportInput): ValidationResult {
  const errors: ReportErrorCode[] = [];
  const warnings: ReportWarningCode[] = [];

  if (!isDepthLevel(input.depth)) {
    errors.push("invalid_depth");
  }

  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon)) {
    errors.push("invalid_coordinates");
  } else if (
    input.lat < PILOT_BOUNDS.minLat ||
    input.lat > PILOT_BOUNDS.maxLat ||
    input.lon < PILOT_BOUNDS.minLon ||
    input.lon > PILOT_BOUNDS.maxLon
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
