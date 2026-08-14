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

export interface LocationInput {
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
}

/** Every code except `invalid_depth`, which this function cannot produce - it
 *  is never given a depth to judge. Narrowing it here means an SOS caller does
 *  not have to carry a message for a failure that can never reach it. */
export type LocationErrorCode = Exclude<ReportErrorCode, "invalid_depth">;

export type LocationResult =
  | { ok: true; warnings: ReportWarningCode[] }
  | { ok: false; errors: LocationErrorCode[] };

/**
 * Everything a depth report and an SOS both have to satisfy: a real
 * coordinate, inside the pilot area.
 *
 * Split out because an SOS no longer carries a depth. Putting one through the
 * whole of `validateReport` would have failed it on `invalid_depth` - refusing
 * a call for help over a form field the sender was deliberately never shown,
 * which is the exact opposite of "the system never refuses an SOS".
 */
export function validateLocation(input: LocationInput): LocationResult {
  const errors: LocationErrorCode[] = [];
  const warnings: ReportWarningCode[] = [];

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

  return errors.length > 0 ? { ok: false, errors } : { ok: true, warnings };
}

export function validateReport(input: ReportInput): ValidationResult {
  const errors: ReportErrorCode[] = [];

  if (!isDepthLevel(input.depth)) {
    errors.push("invalid_depth");
  }

  const location = validateLocation(input);
  if (!location.ok) {
    errors.push(...location.errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    depth: input.depth as DepthLevel,
    warnings: location.ok ? location.warnings : [],
  };
}
